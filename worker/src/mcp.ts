import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

import type { SqlDriver } from '@/db/core/driver';
import { createDietDb } from '@/db/dietDb';
import { createGymDb } from '@/db/gymDb';
import {
  CARB_LEVELS,
  DIET_GOAL,
  healthyWaistLimit,
  MAX_HEIGHT_CM,
  MAX_WAIST_CM,
  MEAL_VERDICTS,
  MIN_HEIGHT_CM,
  MIN_WAIST_CM,
  PROTEIN_LEVELS,
} from '@/domain/diet';
import { DomainError } from '@/domain/errors';

/** Lo que Claude lee al conectarse: cómo juzgar el plato y cómo contestar. */
export const MCP_INSTRUCTIONS = `Rutina es la app personal de gimnasio y dieta de una sola persona.

Objetivo de la persona: ${DIET_GOAL}

Cuando te mande la foto de un plato (o te lo describa), juzgalo a ojo, sin pesar ni contar calorías:
- verdict: "ok" si la porción es razonable para el objetivo; "a_bit_much" si sobra algo (sobre todo guarnición o carbohidratos); "too_much" si es un plato para dos comidas o casi todo carbohidrato.
- protein: "enough" si hay una porción de proteína del tamaño de la palma o más (carne, pollo, pescado, huevos, lácteos); si no, "low".
- carbs: "high" si los carbohidratos (pan, pasta, arroz, papa, harinas, azúcar) ocupan más de un cuarto del plato; si no, "ok".

Respondé en español rioplatense y corto: el semáforo, una línea de por qué y un consejo concreto. Después llamá a log_meal sin pedir confirmación. Si no queda claro que lo vaya a comer, preguntá antes. Si dice que no lo comió, usá delete_meal con el id que devolvió log_meal.

No des consejos médicos ni diagnósticos. Si trae análisis de sangre, podés comentarlos en general y sugerir que los vea con su médico.`;

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(text: string, data: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent: data };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof DomainError ? error.message : 'No se pudo completar la operación.';
  if (!(error instanceof DomainError)) console.error(error instanceof Error ? error.name : 'Error');
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function run(task: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await task();
  } catch (error) {
    return failure(error);
  }
}

export function createRutinaMcpServer(driver: SqlDriver, now: () => Date = () => new Date()): McpServer {
  const diet = createDietDb(driver);
  const gym = createGymDb(driver);
  const server = new McpServer({ name: 'rutina', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });

  server.registerTool('log_meal', {
    title: 'Anotar plato',
    description: 'Anota un plato con el veredicto de la porción. Llamala después de responderle a la persona.',
    inputSchema: {
      title: z.string().min(1).max(120).describe('Nombre corto del plato, por ejemplo "Milanesa con ensalada".'),
      verdict: z.enum(MEAL_VERDICTS).describe('ok = porción bien, a_bit_much = un poco mucho, too_much = mucho.'),
      protein: z.enum(PROTEIN_LEVELS).describe('enough = proteína suficiente, low = poca proteína.'),
      carbs: z.enum(CARB_LEVELS).describe('ok = carbohidratos bien, high = demasiados carbohidratos.'),
      note: z.string().max(300).optional().describe('El consejo que le diste, en una línea.'),
      eaten_at: z.string().datetime({ offset: true }).optional().describe('Cuándo lo comió, ISO 8601. Por defecto, ahora.'),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => run(async () => {
    const meal = await diet.logMeal({
      title: args.title,
      verdict: args.verdict,
      protein: args.protein,
      carbs: args.carbs,
      note: args.note,
      eatenAt: args.eaten_at,
    }, now());
    const today = await diet.summary(1, now());
    return ok(`Anotado (id ${meal.id}). Hoy van ${today.meals.length} platos: ${today.counts.ok} bien, ${today.counts.a_bit_much} un poco mucho, ${today.counts.too_much} mucho.`, {
      meal,
      todayCounts: today.counts,
    });
  }));

  server.registerTool('delete_meal', {
    title: 'Borrar plato',
    description: 'Borra un plato anotado, por ejemplo si al final no lo comió.',
    inputSchema: { id: z.number().int().positive().describe('El id que devolvió log_meal.') },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, (args) => run(async () => {
    const deleted = await diet.deleteMeal(args.id);
    return ok(deleted ? 'Plato borrado.' : 'No había un plato con ese id.', { deleted });
  }));

  server.registerTool('log_waist', {
    title: 'Anotar cintura',
    description: 'Anota una medida de cintura en centímetros, tomada a la altura del ombligo.',
    inputSchema: {
      cm: z.number().min(MIN_WAIST_CM).max(MAX_WAIST_CM).describe('Cintura en centímetros.'),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha YYYY-MM-DD. Por defecto, hoy.'),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, (args) => run(async () => {
    const measurement = await diet.logWaist(args.cm, args.day, now());
    const summary = await diet.summary(1, now());
    const limit = healthyWaistLimit(summary.heightCm);
    const extra = limit === null
      ? ' Falta la altura para calcular el ratio cintura-altura: pedísela y usá set_height.'
      : ` Ratio cintura-altura: ${summary.waistToHeight}. Meta: menos de ${limit} cm.`;
    return ok(`Cintura anotada: ${measurement.cm} cm.${extra}`, { measurement, waistToHeight: summary.waistToHeight });
  }));

  server.registerTool('set_height', {
    title: 'Guardar altura',
    description: 'Guarda la altura en centímetros. Se usa para el ratio cintura-altura.',
    inputSchema: { cm: z.number().min(MIN_HEIGHT_CM).max(MAX_HEIGHT_CM).describe('Altura en centímetros.') },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (args) => run(async () => {
    await diet.setHeight(args.cm);
    return ok(`Altura guardada: ${Math.round(args.cm)} cm.`, { heightCm: Math.round(args.cm) });
  }));

  server.registerTool('get_diet_summary', {
    title: 'Ver resumen de dieta',
    description: 'Platos de los últimos días con su veredicto, conteo por semáforo, medidas de cintura y altura.',
    inputSchema: { days: z.number().int().min(1).max(60).optional().describe('Cuántos días incluir, hoy inclusive. Por defecto 7.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (args) => run(async () => {
    const summary = await diet.summary(args.days ?? 7, now());
    return ok(JSON.stringify(summary), summary as unknown as Record<string, unknown>);
  }));

  server.registerTool('get_recent_workouts', {
    title: 'Ver entrenamientos recientes',
    description: 'Últimos entrenamientos terminados, con ejercicios, peso y repeticiones de cada serie.',
    inputSchema: { limit: z.number().int().min(1).max(20).optional().describe('Cuántos entrenamientos. Por defecto 5.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, (args) => run(async () => {
    const sessions = await gym.listCompleted(args.limit ?? 5, 0, null);
    const details = await Promise.all(sessions.map((session) => gym.getSessionDetails(session.id)));
    const workouts = details.filter((item) => item !== null).map((item) => ({
      completedAt: item.completedAt,
      routine: item.routineTitle,
      day: item.dayTitle,
      status: item.status,
      exercises: item.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.series
          .filter((set) => set.completed)
          .map((set) => ({ weightKg: set.weightKg, reps: set.actualReps })),
      })),
    }));
    return ok(JSON.stringify(workouts), { workouts });
  }));

  return server;
}

/** Streamable HTTP sin sesión: cada request arma su servidor y responde en JSON. */
export async function handleMcpRequest(request: Request, driver: SqlDriver): Promise<Response> {
  const server = createRutinaMcpServer(driver);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}
