const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined
  });
  const page = await browser.newPage();
  const indexPath = path.resolve(__dirname, "..", "index.html");
  await page.goto(`file://${indexPath}`);
  await page.evaluate(() => localStorage.removeItem("somtec_hours_v1"));
  await page.reload();
  await page.getByRole("button", { name: "Resumen" }).count().then((count) => {
    if (count !== 0) throw new Error("La pestaña Resumen no deberia existir");
  });
  await page.getByRole("button", { name: "Empezar tarea" }).first().click();
  await page.locator("#dialogProject").fill("Facturacion Somtec");
  await page.locator("#dialogCustomTask").fill("Factura cliente");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pausar" }).click();
  await page.getByRole("button", { name: "Reanudar" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Finalizar" }).click();
  await page.getByRole("button", { name: "Historial" }).click();
  await page.locator("#periodPanel").getByText("Facturacion Somtec").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Historial" }).click();
  await page.locator("#periodPanel").getByText("Facturacion Somtec").waitFor();
  await page.getByRole("button", { name: "Semana" }).click();
  await page.locator("#periodPanel").getByText("Julian Cuenca").waitFor();
  await page.getByRole("button", { name: "Mes" }).click();
  await page.locator("#periodPanel").getByText("Total").waitFor();
  await page.getByRole("button", { name: "Año" }).click();
  await page.locator("#periodPanel").getByText("Registros").waitFor();
  await page.getByRole("button", { name: "Config" }).click();
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
