/**
 * Manual User Testing Script - ClassroomPath Staging
 *
 * Este script simula el comportamiento de un usuario humano real
 * navegando por la aplicación. Se comporta de manera exploratoria,
 * con pausas realistas y documentación de errores encontrados.
 *
 * Target: https://classroompath-staging.duckdns.org/
 *
 * IMPORTANTE: Ejecutar con headed mode para observar la interacción:
 * npx playwright test manual-user-testing.spec.ts --headed --project=chromium
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración para pruebas manuales en staging
const STAGING_URL = 'https://classroompath-staging.duckdns.org';
const PAUSE_SHORT = 500; // Tiempo de lectura corto (ms)
const PAUSE_MEDIUM = 1500; // Tiempo para leer contenido
const PAUSE_LONG = 3000; // Tiempo para analizar pantalla completa

// Registro de errores encontrados
interface ErrorLog {
  timestamp: string;
  testCase: string;
  category: 'UI' | 'Functional' | 'UX' | 'Performance' | 'Network' | 'Console';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  steps: string;
  expected: string;
  actual: string;
  screenshot?: string;
  consoleErrors?: string[];
  networkErrors?: string[];
}

const errorsFound: ErrorLog[] = [];
const consoleMessages: string[] = [];
const networkErrors: string[] = [];

// Helper para simular comportamiento humano
async function humanPause(ms: number = PAUSE_SHORT): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper para registrar un error
function logError(error: Omit<ErrorLog, 'timestamp'>): void {
  errorsFound.push({
    ...error,
    timestamp: new Date().toISOString(),
    consoleErrors: [...consoleMessages],
    networkErrors: [...networkErrors],
  });
  console.log(`\n❌ ERROR ENCONTRADO [${error.severity.toUpperCase()}]:`);
  console.log(`   Categoría: ${error.category}`);
  console.log(`   Descripción: ${error.description}`);
  console.log(`   Pasos: ${error.steps}`);
  console.log(`   Esperado: ${error.expected}`);
  console.log(`   Actual: ${error.actual}`);
}

// Helper para capturar screenshot con timestamp
async function captureScreenshot(page: Page, name: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `staging-test-${name}-${timestamp}.png`;
  const filepath = path.join(__dirname, 'test-results', 'screenshots', filename);

  // Crear directorio si no existe
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await page.screenshot({ path: filepath, fullPage: true });
  return filename;
}

// Guardar reporte final de errores
function saveErrorReport(): void {
  const reportPath = path.join(
    __dirname,
    'test-results',
    `staging-errors-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  const dir = path.dirname(reportPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const report = {
    testRun: {
      date: new Date().toISOString(),
      targetUrl: STAGING_URL,
      totalErrors: errorsFound.length,
      bySeverity: {
        critical: errorsFound.filter((e) => e.severity === 'critical').length,
        high: errorsFound.filter((e) => e.severity === 'high').length,
        medium: errorsFound.filter((e) => e.severity === 'medium').length,
        low: errorsFound.filter((e) => e.severity === 'low').length,
      },
      byCategory: {
        UI: errorsFound.filter((e) => e.category === 'UI').length,
        Functional: errorsFound.filter((e) => e.category === 'Functional').length,
        UX: errorsFound.filter((e) => e.category === 'UX').length,
        Performance: errorsFound.filter((e) => e.category === 'Performance').length,
        Network: errorsFound.filter((e) => e.category === 'Network').length,
        Console: errorsFound.filter((e) => e.category === 'Console').length,
      },
    },
    errors: errorsFound,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Reporte guardado en: ${reportPath}`);
}

// Setup para capturar errores de consola y red
function setupErrorCapture(page: Page): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    consoleMessages.push(`[PageError] ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    networkErrors.push(`[${request.failure()?.errorText}] ${request.url()}`);
  });
}

// ============================================
// PRUEBAS DE USUARIO COMO HUMANO REAL
// ============================================

test.describe('Pruebas de Usuario en Staging - ClassroomPath', () => {
  test.describe.configure({ mode: 'serial' }); // Ejecutar en serie para simular sesión real

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Crear contexto con viewport de usuario típico
    context = await browser.newContext({
      viewport: { width: 1366, height: 768 }, // Resolución común de laptop
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
    });
    page = await context.newPage();
    setupErrorCapture(page);
  });

  test.afterAll(async () => {
    saveErrorReport();
    await context.close();
  });

  // ========================================
  // TEST 1: Carga inicial de la aplicación
  // ========================================
  test('TC01: Carga inicial y primera impresión', async () => {
    console.log('\n🔍 TC01: Verificando carga inicial de la aplicación...');

    const startTime = Date.now();

    // Como usuario: Abro el navegador y voy a la URL
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });

    const loadTime = Date.now() - startTime;
    console.log(`   ⏱️ Tiempo de carga: ${loadTime}ms`);

    // Verificar que la página cargó
    if (loadTime > 5000) {
      logError({
        testCase: 'TC01',
        category: 'Performance',
        severity: 'medium',
        description: 'Tiempo de carga inicial excesivo',
        steps: 'Navegar a la URL principal',
        expected: 'Carga en menos de 5 segundos',
        actual: `Cargó en ${loadTime}ms`,
      });
    }

    await humanPause(PAUSE_MEDIUM);

    // Verificar que hay contenido visible
    const bodyContent = await page.locator('body').textContent();
    if (!bodyContent || bodyContent.trim().length < 50) {
      logError({
        testCase: 'TC01',
        category: 'UI',
        severity: 'critical',
        description: 'Página sin contenido visible',
        steps: 'Navegar a la URL principal',
        expected: 'Ver formulario de login o contenido de la aplicación',
        actual: 'Página vacía o con muy poco contenido',
        screenshot: await captureScreenshot(page, 'tc01-empty-page'),
      });
    }

    // Verificar título de la página
    const title = await page.title();
    console.log(`   📄 Título: "${title}"`);

    if (!title || title.toLowerCase().includes('error')) {
      logError({
        testCase: 'TC01',
        category: 'UI',
        severity: 'medium',
        description: 'Título de página incorrecto o ausente',
        steps: 'Verificar título de la página',
        expected: 'Título descriptivo de la aplicación',
        actual: `Título: "${title}"`,
      });
    }

    await captureScreenshot(page, 'tc01-initial-load');
    console.log('   ✅ Carga inicial completada');
  });

  // ========================================
  // TEST 2: Exploración del formulario de Login
  // ========================================
  test('TC02: Exploración del formulario de Login', async () => {
    console.log('\n🔍 TC02: Explorando formulario de login...');

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Buscar elementos del formulario de login
    const emailInput = page
      .locator(
        '[data-testid="login-email"], input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="correo" i]'
      )
      .first();
    const passwordInput = page
      .locator('[data-testid="login-password"], input[type="password"], input[name="password"]')
      .first();
    const loginButton = page
      .locator(
        '[data-testid="login-submit"], button[type="submit"], button:has-text("Iniciar"), button:has-text("Login"), button:has-text("Entrar")'
      )
      .first();

    // Verificar que existen los campos
    const emailExists = await emailInput.isVisible().catch(() => false);
    const passwordExists = await passwordInput.isVisible().catch(() => false);
    const loginButtonExists = await loginButton.isVisible().catch(() => false);

    console.log(`   📧 Campo email visible: ${emailExists}`);
    console.log(`   🔒 Campo password visible: ${passwordExists}`);
    console.log(`   🔘 Botón login visible: ${loginButtonExists}`);

    if (!emailExists || !passwordExists) {
      logError({
        testCase: 'TC02',
        category: 'UI',
        severity: 'critical',
        description: 'Formulario de login incompleto o no visible',
        steps: 'Buscar campos de email y password',
        expected: 'Campos de email y password visibles',
        actual: `Email visible: ${emailExists}, Password visible: ${passwordExists}`,
        screenshot: await captureScreenshot(page, 'tc02-login-form-missing'),
      });
      return;
    }

    // Simular usuario escribiendo lentamente
    await emailInput.click();
    await humanPause(PAUSE_SHORT);
    await emailInput.fill('usuario.prueba@test.com');
    await humanPause(PAUSE_SHORT);

    await passwordInput.click();
    await humanPause(PAUSE_SHORT);
    await passwordInput.fill('Test1234!');
    await humanPause(PAUSE_SHORT);

    // Verificar mensajes de error de validación al enviar credenciales incorrectas
    if (loginButtonExists) {
      await loginButton.click();
      await humanPause(PAUSE_MEDIUM);

      // Buscar mensaje de error
      const errorMessage = page.locator('[role="alert"], .error, .text-red-500, [class*="error"]');
      const hasError = await errorMessage.isVisible().catch(() => false);

      if (hasError) {
        const errorText = await errorMessage.textContent();
        console.log(`   ⚠️ Mensaje de error mostrado: "${errorText}"`);
      }

      await captureScreenshot(page, 'tc02-login-error-response');
    }

    console.log('   ✅ Exploración del formulario de login completada');
  });

  // ========================================
  // TEST 3: Navegación al registro
  // ========================================
  test('TC03: Navegación al formulario de registro', async () => {
    console.log('\n🔍 TC03: Navegando al registro...');

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Buscar enlace de registro con data-testid o texto
    const registerLink = page.locator(
      '[data-testid="navigate-to-register"], a:has-text("Registr"), a:has-text("Sign up"), a:has-text("Crear cuenta"), button:has-text("Registr"), button:has-text("Regístrate")'
    );
    const registerLinkVisible = await registerLink
      .first()
      .isVisible()
      .catch(() => false);

    if (!registerLinkVisible) {
      logError({
        testCase: 'TC03',
        category: 'UX',
        severity: 'high',
        description: 'No se encuentra enlace visible para registro',
        steps: 'Buscar enlace o botón para ir a registro',
        expected: 'Enlace visible para nuevos usuarios',
        actual: 'No se encontró enlace de registro',
        screenshot: await captureScreenshot(page, 'tc03-no-register-link'),
      });
      return;
    }

    console.log('   🔗 Enlace de registro encontrado, haciendo click...');
    await registerLink.first().click();
    await humanPause(PAUSE_MEDIUM);

    // Verificar que se muestra el formulario de registro
    const registerEmailInput = page
      .locator('[data-testid="register-email"], input[name="email"], input[type="email"]')
      .first();
    const registerNameInput = page
      .locator('[data-testid="register-name"], input[name="name"], input[placeholder*="nombre" i]')
      .first();
    const registerPasswordInput = page
      .locator('[data-testid="register-password"], input[type="password"]')
      .first();

    const emailVisible = await registerEmailInput.isVisible().catch(() => false);
    const nameVisible = await registerNameInput.isVisible().catch(() => false);
    const passwordVisible = await registerPasswordInput.isVisible().catch(() => false);

    console.log(`   📧 Campo email: ${emailVisible}`);
    console.log(`   👤 Campo nombre: ${nameVisible}`);
    console.log(`   🔒 Campo password: ${passwordVisible}`);

    if (!emailVisible || !passwordVisible) {
      logError({
        testCase: 'TC03',
        category: 'UI',
        severity: 'high',
        description: 'Formulario de registro no se muestra correctamente',
        steps: 'Navegar al formulario de registro',
        expected: 'Ver campos de registro (email, nombre, password)',
        actual: `Email: ${emailVisible}, Nombre: ${nameVisible}, Password: ${passwordVisible}`,
        screenshot: await captureScreenshot(page, 'tc03-register-form-incomplete'),
      });
    }

    await captureScreenshot(page, 'tc03-register-form');
    console.log('   ✅ Navegación al registro completada');
  });

  // ========================================
  // TEST 4: Validación del formulario de registro
  // ========================================
  test('TC04: Validación del formulario de registro', async () => {
    console.log('\n🔍 TC04: Probando validaciones de registro...');

    // Asegurar que estamos en la página de registro
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_SHORT);

    const registerLink = page.locator(
      '[data-testid="navigate-to-register"], a:has-text("Registr"), button:has-text("Registr"), button:has-text("Regístrate")'
    );
    if (
      await registerLink
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await registerLink.first().click();
      await humanPause(PAUSE_MEDIUM);
    }

    // Probar email inválido
    const emailInput = page
      .locator('[data-testid="register-email"], input[name="email"], input[type="email"]')
      .first();
    const submitButton = page
      .locator('[data-testid="register-submit"], button[type="submit"]')
      .first();

    if (await emailInput.isVisible().catch(() => false)) {
      // Test: Email inválido
      await emailInput.fill('emailinvalido');
      await humanPause(PAUSE_SHORT);

      // Verificar si hay validación en tiempo real
      const emailError = page.locator(
        '[class*="error"]:near([name="email"]), [aria-invalid="true"]'
      );
      const hasEmailError = await emailError.isVisible().catch(() => false);
      console.log(`   ✉️ Validación email inválido: ${hasEmailError ? 'Mostrada' : 'No mostrada'}`);

      // Limpiar y probar email válido
      await emailInput.fill('email.valido@ejemplo.com');
      await humanPause(PAUSE_SHORT);
    }

    // Probar password débil
    const passwordInput = page
      .locator('[data-testid="register-password"], input[type="password"]')
      .first();
    if (await passwordInput.isVisible().catch(() => false)) {
      await passwordInput.fill('123');
      await humanPause(PAUSE_SHORT);

      // Buscar indicador de fortaleza de password con nuevos selectores
      const strengthIndicator = page.locator(
        '[data-testid="password-strength"], .password-strength-indicator, [class*="strength"], [class*="password-meter"]'
      );
      const hasStrengthIndicator = await strengthIndicator.isVisible().catch(() => false);
      console.log(
        `   🔐 Indicador de fortaleza: ${hasStrengthIndicator ? 'Visible' : 'No visible'}`
      );

      if (!hasStrengthIndicator) {
        logError({
          testCase: 'TC04',
          category: 'UX',
          severity: 'low',
          description: 'No hay indicador visual de fortaleza de contraseña',
          steps: 'Escribir contraseña en campo de registro',
          expected: 'Indicador de fortaleza de contraseña',
          actual: 'No se muestra indicador',
        });
      }
    }

    await captureScreenshot(page, 'tc04-validation-test');
    console.log('   ✅ Prueba de validaciones completada');
  });

  // ========================================
  // TEST 5: Verificación de Login con Google
  // ========================================
  test('TC05: Botón de login con Google', async () => {
    console.log('\n🔍 TC05: Verificando opción de login con Google...');

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Buscar botón de Google con nuevos selectores
    const googleButton = page.locator(
      '[data-testid="google-login-container"], [data-testid="google-fallback-btn"], button:has-text("Google"), [class*="google"], button[aria-label*="Google" i]'
    );
    const googleButtonVisible = await googleButton.isVisible().catch(() => false);

    console.log(`   🔵 Botón Google visible: ${googleButtonVisible}`);

    if (!googleButtonVisible) {
      logError({
        testCase: 'TC05',
        category: 'Functional',
        severity: 'medium',
        description: 'Botón de login con Google no visible',
        steps: 'Buscar opción de login con Google en página principal',
        expected: 'Botón de login con Google visible',
        actual: 'No se encontró botón de Google',
        screenshot: await captureScreenshot(page, 'tc05-no-google-button'),
      });
    } else {
      // Verificar que el botón se puede clickear
      const isEnabled = await googleButton.isEnabled();
      console.log(`   🔵 Botón Google habilitado: ${isEnabled}`);

      if (!isEnabled) {
        logError({
          testCase: 'TC05',
          category: 'Functional',
          severity: 'high',
          description: 'Botón de Google deshabilitado',
          steps: 'Verificar estado del botón de Google',
          expected: 'Botón habilitado y clickeable',
          actual: 'Botón deshabilitado',
        });
      }
    }

    await captureScreenshot(page, 'tc05-google-login');
    console.log('   ✅ Verificación de login con Google completada');
  });

  // ========================================
  // TEST 6: Responsive - Vista móvil
  // ========================================
  test('TC06: Vista responsive móvil', async () => {
    console.log('\n🔍 TC06: Probando vista móvil...');

    // Cambiar a viewport móvil
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Verificar que el formulario es visible y usable en móvil
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    const emailVisible = await emailInput.isVisible().catch(() => false);
    const passwordVisible = await passwordInput.isVisible().catch(() => false);

    console.log(`   📱 Email visible en móvil: ${emailVisible}`);
    console.log(`   📱 Password visible en móvil: ${passwordVisible}`);

    // Verificar que los elementos no se superponen
    if (emailVisible && passwordVisible) {
      const emailBox = await emailInput.boundingBox();
      const passwordBox = await passwordInput.boundingBox();

      if (emailBox && passwordBox && emailBox.y + emailBox.height > passwordBox.y) {
        logError({
          testCase: 'TC06',
          category: 'UI',
          severity: 'medium',
          description: 'Elementos se superponen en vista móvil',
          steps: 'Abrir aplicación en viewport móvil (375x667)',
          expected: 'Formulario legible sin superposiciones',
          actual: 'Campos de formulario se superponen',
          screenshot: await captureScreenshot(page, 'tc06-mobile-overlap'),
        });
      }
    }

    // Verificar scroll horizontal (no debería existir)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalScroll) {
      logError({
        testCase: 'TC06',
        category: 'UI',
        severity: 'medium',
        description: 'Scroll horizontal en vista móvil',
        steps: 'Verificar scroll horizontal en viewport móvil',
        expected: 'Sin scroll horizontal',
        actual: 'Existe scroll horizontal',
        screenshot: await captureScreenshot(page, 'tc06-horizontal-scroll'),
      });
    }

    await captureScreenshot(page, 'tc06-mobile-view');

    // Restaurar viewport
    await page.setViewportSize({ width: 1366, height: 768 });
    console.log('   ✅ Prueba de vista móvil completada');
  });

  // ========================================
  // TEST 7: Verificar errores de consola
  // ========================================
  test('TC07: Análisis de errores de consola', async () => {
    console.log('\n🔍 TC07: Analizando errores de consola...');

    // Limpiar errores previos
    consoleMessages.length = 0;
    networkErrors.length = 0;

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_LONG);

    // Navegar un poco para generar posibles errores
    const registerLink = page.locator(
      '[data-testid="navigate-to-register"], a:has-text("Registr"), button:has-text("Registr"), button:has-text("Regístrate")'
    );
    if (
      await registerLink
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await registerLink.first().click();
      await humanPause(PAUSE_MEDIUM);
    }

    // Filtrar errores esperados (Google Play logging son normales)
    const significantConsoleErrors = consoleMessages.filter(
      (msg) =>
        !msg.includes('play.google.com') &&
        !msg.includes('accounts.google.com') &&
        !msg.includes('gstatic.com')
    );

    const significantNetworkErrors = networkErrors.filter(
      (err) =>
        !err.includes('play.google.com') &&
        !err.includes('accounts.google.com') &&
        !err.includes('gstatic.com')
    );

    // Reportar errores de consola encontrados
    if (significantConsoleErrors.length > 0) {
      console.log(`   ⚠️ Errores de consola significativos: ${significantConsoleErrors.length}`);
      significantConsoleErrors.forEach((msg, i) => {
        console.log(`      ${i + 1}. ${msg.substring(0, 100)}...`);
      });

      logError({
        testCase: 'TC07',
        category: 'Console',
        severity: significantConsoleErrors.some((m) => m.includes('Error')) ? 'high' : 'low',
        description: `Se encontraron ${significantConsoleErrors.length} errores en consola`,
        steps: 'Navegar por la aplicación y capturar errores de consola',
        expected: 'Sin errores de consola',
        actual: `${significantConsoleErrors.length} errores encontrados`,
      });
    } else {
      console.log('   ✅ Sin errores de consola significativos');
      if (consoleMessages.length > 0) {
        console.log(`   ℹ️ (${consoleMessages.length} errores de Google Services ignorados)`);
      }
    }

    // Reportar errores de red significativos
    if (significantNetworkErrors.length > 0) {
      console.log(`   ⚠️ Errores de red significativos: ${significantNetworkErrors.length}`);
      significantNetworkErrors.forEach((err, i) => {
        console.log(`      ${i + 1}. ${err.substring(0, 100)}...`);
      });

      logError({
        testCase: 'TC07',
        category: 'Network',
        severity: 'high',
        description: `Se encontraron ${significantNetworkErrors.length} errores de red`,
        steps: 'Navegar por la aplicación y capturar errores de red',
        expected: 'Sin errores de red',
        actual: `${significantNetworkErrors.length} errores de red`,
      });
    } else {
      console.log('   ✅ Sin errores de red significativos');
      if (networkErrors.length > 0) {
        console.log(`   ℹ️ (${networkErrors.length} errores de Google Services ignorados)`);
      }
    }

    console.log('   ✅ Análisis de consola completado');
  });

  // ========================================
  // TEST 8: Accesibilidad básica
  // ========================================
  test('TC08: Verificación de accesibilidad básica', async () => {
    console.log('\n🔍 TC08: Verificando accesibilidad básica...');

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Verificar labels en inputs
    const inputs = page.locator('input:visible');
    const inputCount = await inputs.count();

    let inputsWithoutLabel = 0;
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const hasLabel = await input.evaluate((el) => {
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const placeholder = el.getAttribute('placeholder');
        const hasAssociatedLabel = id && document.querySelector(`label[for="${id}"]`);
        return !!(hasAssociatedLabel || ariaLabel || ariaLabelledBy || placeholder);
      });

      if (!hasLabel) {
        inputsWithoutLabel++;
      }
    }

    if (inputsWithoutLabel > 0) {
      logError({
        testCase: 'TC08',
        category: 'UX',
        severity: 'medium',
        description: `${inputsWithoutLabel} campos de entrada sin label accesible`,
        steps: 'Verificar labels y aria-labels en inputs',
        expected: 'Todos los inputs con label asociado',
        actual: `${inputsWithoutLabel} de ${inputCount} inputs sin label`,
        screenshot: await captureScreenshot(page, 'tc08-accessibility'),
      });
    }

    console.log(`   📋 Inputs totales: ${inputCount}`);
    console.log(`   ⚠️ Inputs sin label: ${inputsWithoutLabel}`);

    // Verificar contraste (básico - solo verificar si hay texto muy claro)
    const lowContrastElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let count = 0;
      elements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        // Detectar colores muy claros sobre fondo blanco
        if (color.includes('rgb(200') || color.includes('rgb(220') || color.includes('rgb(240')) {
          count++;
        }
      });
      return count;
    });

    if (lowContrastElements > 10) {
      console.log(
        `   ⚠️ Posibles problemas de contraste detectados: ${lowContrastElements} elementos`
      );
    }

    console.log('   ✅ Verificación de accesibilidad completada');
  });

  // ========================================
  // TEST 9: Navegación con teclado
  // ========================================
  test('TC09: Navegación con teclado', async () => {
    console.log('\n🔍 TC09: Probando navegación con teclado...');

    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await humanPause(PAUSE_MEDIUM);

    // Presionar Tab varias veces y verificar focus visible
    let focusableElements = 0;
    let hasVisibleFocus = true;

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await humanPause(200);

      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;

        const style = window.getComputedStyle(el);
        const hasFocusStyle =
          style.outline !== 'none' ||
          style.boxShadow !== 'none' ||
          el.classList.contains('focus') ||
          el.classList.toString().includes('focus');

        return {
          tag: el.tagName,
          hasVisibleFocus: hasFocusStyle,
        };
      });

      if (focusedElement) {
        focusableElements++;
        if (!focusedElement.hasVisibleFocus) {
          hasVisibleFocus = false;
        }
      }
    }

    console.log(`   ⌨️ Elementos focuseables encontrados: ${focusableElements}`);
    console.log(`   👁️ Focus visible en todos: ${hasVisibleFocus}`);

    if (!hasVisibleFocus) {
      logError({
        testCase: 'TC09',
        category: 'UX',
        severity: 'medium',
        description: 'Algunos elementos no muestran indicador de focus visible',
        steps: 'Navegar con Tab por la interfaz',
        expected: 'Indicador de focus visible en todos los elementos interactivos',
        actual: 'Algunos elementos no muestran focus visible',
        screenshot: await captureScreenshot(page, 'tc09-keyboard-nav'),
      });
    }

    console.log('   ✅ Prueba de navegación con teclado completada');
  });

  // ========================================
  // TEST 10: Resumen final
  // ========================================
  test('TC10: Generación de resumen final', async () => {
    console.log('\n📊 RESUMEN DE PRUEBAS MANUALES DE USUARIO');
    console.log('==========================================');
    console.log(`URL probada: ${STAGING_URL}`);
    console.log(`Total de errores encontrados: ${errorsFound.length}`);
    console.log('');

    if (errorsFound.length === 0) {
      console.log('✅ ¡No se encontraron errores durante las pruebas!');
    } else {
      console.log('Errores por severidad:');
      const critical = errorsFound.filter((e) => e.severity === 'critical');
      const high = errorsFound.filter((e) => e.severity === 'high');
      const medium = errorsFound.filter((e) => e.severity === 'medium');
      const low = errorsFound.filter((e) => e.severity === 'low');

      if (critical.length > 0) console.log(`   🔴 Críticos: ${critical.length}`);
      if (high.length > 0) console.log(`   🟠 Altos: ${high.length}`);
      if (medium.length > 0) console.log(`   🟡 Medios: ${medium.length}`);
      if (low.length > 0) console.log(`   🟢 Bajos: ${low.length}`);

      console.log('\nErrores por categoría:');
      const categories = ['UI', 'Functional', 'UX', 'Performance', 'Network', 'Console'] as const;
      categories.forEach((cat) => {
        const count = errorsFound.filter((e) => e.category === cat).length;
        if (count > 0) console.log(`   - ${cat}: ${count}`);
      });
    }

    console.log('\n==========================================');
    console.log('Reporte JSON guardado en: e2e/test-results/');
  });
});
