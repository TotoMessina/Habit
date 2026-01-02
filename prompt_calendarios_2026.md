# Prompt detallado — Web “Calendarios 2026” (HTML/CSS/JS + Supabase)

## Rol
Actuá como un **arquitecto + desarrollador full‑stack**. Entregá una solución **lista para copiar/pegar** (frontend estático con HTML/CSS/JS puro, usando Supabase como backend). El estilo visual debe ser **claro (light theme)**, moderno y limpio.

## Objetivo del producto
Construir una web tipo **habit tracker por día**, enfocada en el año **2026**, con la capacidad de:
- Crear **múltiples calendarios** (ej. “Novia”, “Entreno”, “Comida”).
- Cada calendario tiene:
  - Un **estado principal** booleano (cumplí/no cumplí) que define el **color del día**.
  - **Marcadores secundarios** (emoji/letra) independientes del color, para registrar detalles del día.
- Una pantalla de **estadísticas** que calcule todo **hasta la fecha actual** (clamp al año 2026).

---

## Requisitos funcionales (MVP)
### 1) Autenticación (obligatoria)
- Registro y login con **email + contraseña** (no OTP).
- El usuario se registra una única vez y luego ingresa con los mismos datos.
- Usar **Supabase Auth** (email/password).
- Logout disponible.

### 2) Gestión de calendarios
- Crear calendarios con:
  - `name` (texto)
  - `year` (por defecto 2026)
  - `primary_label` (ej. “Nos vimos”, “Entrené”)
  - `primary_on_color` y `primary_off_color` (hex)
- Listar calendarios del usuario para 2026.
- Seleccionar calendario activo desde un `<select>`.

### 3) Marcadores secundarios por calendario
- Para cada calendario, el usuario puede definir marcadores:
  - `key` (única dentro del calendario)
  - `label` (texto)
  - `symbol` (emoji o letra)
  - `sort_order`
- CRUD mínimo:
  - Crear marcador
  - Listar marcadores
  - Eliminar marcador

### 4) Entradas por día (día = fecha)
Para cada calendario y fecha (2026-01-01 a 2026-12-31):
- `primary_done`: boolean (determina el color de fondo)
- `markers`: json con keys boolean (ej. `{ "ate_together": true }`)
- `note`: texto opcional
- Operaciones:
  - Click en día: abre modal
  - En modal: toggle de `primary_done`
  - Toggles por marcador
  - Guardar nota
  - Limpiar marcadores del día

### 5) Vista calendario (2026)
- Renderizar el año 2026 por meses (12 meses).
- Cada día debe mostrar:
  - Número del día
  - Símbolos de marcadores activos (ej. “🍽 😴”)
  - Fondo con un tinte suave según `primary_done`:
    - ON usa `primary_on_color`
    - OFF usa `primary_off_color`
- La UI debe ser **responsive** (3 columnas desktop, 2 tablet, 1 mobile).

### 6) Estadísticas (hasta hoy)
- Una pestaña/solapa “Estadísticas” que muestre (hasta la fecha actual, clampeada a 2026):
  - Días transcurridos
  - Días cumplidos (primary_done = true)
  - % cumplimiento
  - Racha actual (streak) de días cumplidos hacia atrás desde hoy
  - Cumplidos por mes (barras 1..12)

---

## Requisitos no funcionales
- **Sin frameworks** (sin React/Vue). HTML/CSS/JS puro.
- Manejo de errores: mostrar `alert()` o un mensaje en pantalla.
- Evitar llamadas innecesarias: cache en memoria (Map por fecha) y refrescar UI localmente al editar un día.
- Seguridad:
  - Row Level Security (RLS) activo en Supabase.
  - Policies: el usuario solo puede leer/escribir sus calendarios y registros.

---

## UI/UX (light theme)
- Fondo claro, tarjetas blancas, sombras suaves.
- Acciones primarias destacadas (crear, guardar).
- Modal centrado con backdrop.
- Componentes:
  1) Pantalla Auth (email + password) con botones:
     - “Crear cuenta”
     - “Ingresar”
  2) Pantalla App:
     - Header con tabs: “Calendarios” y “Estadísticas”
     - Selector de calendario
     - Botón “Nuevo calendario”
     - Botón “Marcadores”
  3) Modal Día:
     - Toggle principal
     - Lista de marcadores con switches
     - Nota + botón guardar
     - Botón “Limpiar marcadores”
  4) Modal Marcadores:
     - Form: key/label/symbol
     - Lista de chips con botón eliminar

---

## Entregables esperados
1) SQL completo para crear tablas, índices, trigger y RLS policies.
2) Archivos css, js y html para la app.
3) Checklist breve “para que funcione”:
   - Crear tablas
   - Exposed schemas = public
   - Pegar SUPABASE_URL y SUPABASE_ANON_KEY
   - Habilitar Email provider en Supabase Auth

---

## Criterios de aceptación (Definition of Done)
- Un usuario nuevo puede crear cuenta, loguearse y ver un calendario default.
- Puede crear un calendario adicional, crear marcadores y registrar días.
- Los datos persisten al recargar.
- Estadísticas coinciden con los datos cargados hasta la fecha actual (clamp 2026).
- No hay errores PGRST205/404 por tablas inexistentes cuando el SQL está aplicado y `public` expuesto.
