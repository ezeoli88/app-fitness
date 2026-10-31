import { SELF } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createD1Driver } from '../src/d1Driver';
import { handleMcpRequest } from '../src/mcp';

const ORIGIN = 'http://127.0.0.1';

let rpcId = 0;
async function callTool(name: string, args: Record<string, unknown>) {
  rpcId += 1;
  const request = new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const response = await handleMcpRequest(request, createD1Driver(env.DB));
  expect(response.status).toBe(200);
  const body = await response.json() as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> } };
  return body.result;
}

const march = {
  day: '2026-03-10',
  lab: 'Laboratorio Central',
  results: [
    { key: 'glucose', name: 'Glucosa', category: 'metabolic', value: 108, unit: 'mg/dL', ref_low: 70, ref_high: 100, ref_text: '70 - 100' },
    { key: 'triglycerides', name: 'Triglicéridos', category: 'lipids', value: 210, unit: 'mg/dL', ref_high: 150 },
    { key: 'hdl', name: 'Colesterol HDL', category: 'lipids', value: 38, unit: 'mg/dL', ref_low: 40 },
    { key: 'urine_glucose', name: 'Glucosa en orina', category: 'urine', value_text: 'Negativo' },
  ],
};

beforeEach(async () => {
  await env.DB.exec('DELETE FROM lab_results; DELETE FROM lab_reports;');
});

describe('Análisis de sangre por el conector', () => {
  it('guarda todos los valores y marca los que quedan fuera de rango', async () => {
    const saved = await callTool('save_lab_report', march);
    expect(saved.isError).toBeUndefined();
    expect(saved.content[0].text).toContain('4 valores');
    expect(saved.content[0].text).toContain('Glucosa alto');
    expect(saved.content[0].text).toContain('Colesterol HDL bajo');

    const list = await (await SELF.fetch(`${ORIGIN}/api/labs`)).json() as { reports: { day: string; results: { key: string; flag: string; valueText: string | null }[] }[] };
    expect(list.reports).toHaveLength(1);
    expect(list.reports[0].results.map((result) => [result.key, result.flag])).toEqual([
      ['glucose', 'high'], ['triglycerides', 'high'], ['hdl', 'low'], ['urine_glucose', 'unknown'],
    ]);
    expect(list.reports[0].results[3].valueText).toBe('Negativo');
  });

  it('arma la evolución con el cociente triglicéridos/HDL', async () => {
    await callTool('save_lab_report', march);
    await callTool('save_lab_report', {
      day: '2026-09-15',
      results: [
        { key: 'glucose', name: 'Glucosa', category: 'metabolic', value: 96, unit: 'mg/dL', ref_low: 70, ref_high: 100 },
        { key: 'triglycerides', name: 'Triglicéridos', category: 'lipids', value: 140, unit: 'mg/dL', ref_high: 150 },
        { key: 'hdl', name: 'Colesterol HDL', category: 'lipids', value: 45, unit: 'mg/dL', ref_low: 40 },
      ],
    });
    const history = await callTool('get_lab_history', { keys: ['glucose', 'tg_hdl'] });
    const series = history.structuredContent?.series as { key: string; points: { day: string; value: number; flag: string }[] }[];
    expect(series.map((item) => item.key)).toEqual(['glucose', 'tg_hdl']);
    expect(series[0].points).toEqual([
      { day: '2026-03-10', value: 108, flag: 'high' },
      { day: '2026-09-15', value: 96, flag: 'normal' },
    ]);
    expect(series[1].points.map((point) => point.value)).toEqual([5.53, 3.11]);
  });

  it('rechaza un estudio sin fecha válida o con claves repetidas sin guardar nada', async () => {
    const badDay = await callTool('save_lab_report', { ...march, day: '2026-02-30' });
    expect(badDay.isError).toBe(true);
    const repeated = await callTool('save_lab_report', { ...march, results: [march.results[0], march.results[0]] });
    expect(repeated.isError).toBe(true);
    expect(repeated.content[0].text).toContain('repetida');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM lab_reports').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('borra un estudio con sus valores', async () => {
    const saved = await callTool('save_lab_report', march);
    const id = (saved.structuredContent?.report as { id: number }).id;
    const response = await SELF.fetch(`${ORIGIN}/api/labs/${id}`, { method: 'DELETE' });
    expect(await response.json()).toEqual({ deleted: true });
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM lab_results').first<{ n: number }>();
    expect(left?.n).toBe(0);
    expect((await callTool('delete_lab_report', { id })).structuredContent).toEqual({ deleted: false });
  });

  it('exige Access fuera de localhost', async () => {
    expect((await SELF.fetch('https://rutina.example/api/labs')).status).toBe(403);
  });
});
