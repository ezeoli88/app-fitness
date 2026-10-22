import { expect, type Page, test } from '@playwright/test';

async function openRoutineAction(page: Page, title: string, action: 'Editar' | 'Archivar') {
  const pick = page.getByRole('button', { name: new RegExp(title) }).first();
  const card = pick.locator('xpath=ancestor::*[.//*[@role="button" and normalize-space()="' + action + '"]][1]');
  await card.getByRole('button', { name: action }).click();
}

test('entrena, corrige el historial y archiva', async ({ page }, info) => {
  const title = `QA ${info.project.name}`;
  await page.goto('/routines');
  await page.getByRole('button', { name: 'Nueva' }).click();
  await page.getByLabel('Nombre de la rutina').fill(title);
  await page.getByLabel('Ejercicio 1 del día 1').fill('Press');
  await page.getByLabel('Series previstas para Press').fill('2');
  await page.getByLabel('Repeticiones previstas para Press').fill('8');
  await page.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) }).first()).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`personalizada ${title}`) }).first().click();
  await expect(page.getByRole('button', { name: new RegExp(`${title} Activa`) })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Entrenar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Día 1' })).toBeVisible();

  if (info.project.name === 'desktop') {
    const day = await page.getByRole('button', { name: 'Día 1' }).boundingBox();
    const sessions = await page.getByText('Sesiones', { exact: true }).boundingBox();
    expect(day && sessions && day.x < sessions.x).toBeTruthy();
  }

  await page.getByRole('button', { name: 'Día 1' }).click();
  const sessionWeight = page.getByLabel('Peso de la serie 1, en kilogramos');
  await sessionWeight.fill('12,5');
  await sessionWeight.blur();
  await page.getByRole('checkbox', { name: 'Serie 1' }).click();
  await expect(page.getByText(/^DESCANSO/)).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await page.getByRole('button', { name: 'Finalizar sesión' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('button', { name: 'Finalizar entrenamiento' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await page.getByRole('button', { name: 'Finalizar sesión' }).click();
  await expect(page.getByText('Sesión parcial guardada')).toBeVisible();
  await page.goto('/history');
  await page.getByRole('button', { name: /Día 1/ }).click();
  const weight = page.getByLabel('Peso de la serie 1, en kilogramos');
  await expect(weight).toHaveValue('12.5');
  await weight.fill('13,5');
  await weight.blur();
  await page.reload();
  if (info.project.name === 'desktop') await page.getByRole('button', { name: /Día 1/ }).click();
  await expect(page.getByLabel('Peso de la serie 1, en kilogramos')).toHaveValue('13.5');

  await page.goto('/routines');
  await openRoutineAction(page, title, 'Editar');
  await page.getByLabel('Nombre de la rutina').fill(`${title} editada`);
  await page.getByRole('button', { name: 'Guardar rutina' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`${title} editada`) }).first()).toBeVisible();
  await openRoutineAction(page, `${title} editada`, 'Archivar');
  await page.getByRole('button', { name: 'Archivar' }).last().click();
  const archivedBadge = page.getByText('Archivada', { exact: true }).last();
  await archivedBadge.scrollIntoViewIfNeeded();
  await expect(archivedBadge).toBeVisible();
});
