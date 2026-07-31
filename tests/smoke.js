const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined
  });
  const page = await browser.newPage();
  const indexPath = path.resolve(__dirname, "..", "index.html");
  await page.goto(`file://${indexPath}?localOnly=1`);
  await page.evaluate(() => localStorage.removeItem("somtec_hours_v1"));
  await page.reload();

  await page.getByRole("button", { name: "Resumen" }).count().then((count) => {
    if (count !== 0) throw new Error("La pestaña Resumen no deberia existir");
  });

  await page.getByRole("button", { name: "Registrar entrada" }).first().click();
  await page.locator("#dialogProject").selectOption({ label: "Facturación" });
  await page.locator("#dialogTask").selectOption({ label: "Interna" });
  await page.locator("#confirmTaskBtn").click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Registrar salida" }).click();

  await page.getByRole("button", { name: "Historial" }).click();
  await page.locator("#periodPanel").getByText("Facturación / Interna").first().waitFor();
  await page.getByRole("button", { name: "Semana" }).click();
  await page.locator("#periodPanel").getByText("Horas normales").first().waitFor();
  await page.getByRole("button", { name: "Mes" }).click();
  await page.locator("#periodPanel").getByText("Horas extras").first().waitFor();
  await page.getByRole("button", { name: "Año" }).click();
  await page.locator("#periodPanel").getByText("Vacaciones").first().waitFor();
  await page.getByRole("button", { name: "Rango" }).click();
  const today = await page.locator("#periodDate").inputValue();
  await page.locator("#periodRangeStart").fill(today);
  await page.locator("#periodRangeStart").dispatchEvent("change");
  await page.locator("#periodRangeEnd").fill(today);
  await page.locator("#periodRangeEnd").dispatchEvent("change");
  await page.locator("#periodPanel").getByText("Facturación / Interna").first().waitFor();
  await page.getByRole("button", { name: "Anterior" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Día" }).click();

  await page.getByRole("button", { name: "Registro" }).click();
  await page.getByRole("button", { name: "Horas extras" }).click();
  await page.locator("#dialogProject").selectOption({ label: "Servicios" });
  await page.locator("#dialogTask").selectOption({ label: "Soporte cliente" });
  await page.locator("#manualHours").fill("1.5");
  await page.getByRole("button", { name: "Guardar extras" }).click();

  await page.getByRole("button", { name: "Vacaciones" }).click();
  await page.locator("#vacationHours").fill("8");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByRole("button", { name: "Historial" }).click();
  await page.locator("#periodPanel").getByText("Servicios / Soporte cliente").first().waitFor();
  await page.locator("#periodPanel").getByText("Vacaciones").first().waitFor();

  await page.getByRole("button", { name: "Editar" }).first().click();
  await page.locator("#editHours").fill("2");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.locator("#recordDialog").waitFor({ state: "hidden" });

  await page.reload();
  await page.getByRole("button", { name: "Historial" }).click();
  await page.locator("#periodPanel").getByText("Facturación / Interna").first().waitFor();

  await page.getByRole("button", { name: "Configuración" }).click();
  await page.locator("#configEmployees").getByRole("button", { name: "Editar" }).first().click();
  await page.locator("#configEmployeePhoto").setInputFiles(path.resolve(__dirname, "..", "assets", "favicon.png"));
  await page.locator("img#configEmployeePhotoPreview.profile-preview").waitFor();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.locator("#configEmployees img.config-avatar").first().waitFor();
  await page.getByRole("button", { name: "Añadir trabajador" }).click();
  await page.locator("#configEmployeeName").fill("Nueva Persona");
  await page.locator("#configEmployeeRole").fill("Pruebas");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.locator("#configEmployees").getByText("Nueva Persona").waitFor();
  await page.getByRole("button", { name: "Añadir tarea" }).click();
  await page.locator("#configTaskName").fill("Calidad");
  await page.locator("#configSubtasks").fill("Revision\nEntrega");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.locator("#configTasks").getByText("Calidad").waitFor();

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
