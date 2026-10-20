# Panel de Vida

Una sola página que junta tu calendario, tu correo y tus tareas, y te manda un resumen por correo cada mañana.

- **Hoy en una línea**: reuniones, horas libres y la tarea más importante.
- **Agenda**: línea de tiempo del día con conflictos, eventos pegados (menos de 15 min) y bloques libres de más de 45 min. Selector de 7 días.
- **Correos**: hilos sin leer o sin respuesta de las últimas 48 h, clasificados por IA en *responder hoy*, *esperando respuesta* e *informativo*.
- **Tareas**: crear, editar, completar y borrar. Se pueden escribir en una línea: "pagar luz el viernes".
- **Alertas cruzadas**: correos con fechas que no están en tu calendario, reuniones sin enlace ni descripción, tareas sin tiempo libre y días con más de 6 h de reuniones.
- **Estado de conexiones** con botón para reconectar Google.
- **Resumen matutino** por correo (Resend) y botón "Enviar resumen ahora".

**Solo lectura:** la app nunca envía, borra ni modifica correos o eventos. Los permisos que pide a Google son `calendar.readonly` y `gmail.readonly`.

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS 4 con componentes estilo shadcn/ui, Supabase (Postgres, Auth, RLS), Google Calendar y Gmail API, Anthropic API, Resend y Vercel Cron.

---

## Puesta en marcha (en este orden)

Vas a abrir 6 sitios. Ten a mano un bloc de notas para ir pegando las llaves.

### 1. Vercel: obtener la dirección de tu app

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. **Add New → Project** → importa el repositorio `plandevida` → **Deploy** (todavía sin variables; está bien que la app aún no funcione).
3. Copia la dirección que te da, por ejemplo `https://plandevida.vercel.app`. A partir de aquí la llamamos **TU_URL**.

### 2. Supabase: base de datos y login

1. En [supabase.com](https://supabase.com) crea un proyecto nuevo (guarda la contraseña de la base de datos).
2. **SQL Editor → New query**, pega todo el archivo `supabase/migrations/20261020000000_init.sql` y presiona **Run**. Crea las 4 tablas con Row Level Security.
3. **Project Settings → API**: copia `Project URL`, la llave `anon public` y la llave `service_role` (esta última es secreta).
4. **Authentication → URL Configuration**:
   - Site URL: `TU_URL`
   - Redirect URLs: agrega `TU_URL/auth/callback` y `http://localhost:3000/auth/callback`
5. Deja abierta la pestaña; en el paso 3.7 regresas a **Authentication → Providers → Google**.

### 3. Google Cloud: permiso para leer Calendar y Gmail

1. En [console.cloud.google.com](https://console.cloud.google.com) crea un proyecto nuevo ("Panel de Vida").
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API** y **Gmail API**.
3. **Google Auth Platform → Branding / Pantalla de consentimiento**: tipo de usuario **Externo**, nombre "Panel de Vida", tu correo como soporte y contacto.
4. **Público (Audience)**: deja el estado de publicación en **Testing** y en **Usuarios de prueba** agrega tu correo.
5. **Acceso a datos (Data access)**: agrega los permisos `.../auth/calendar.readonly` y `.../auth/gmail.readonly`.
6. **Clientes → Crear cliente**: tipo **Aplicación web**. En **URI de redireccionamiento autorizados** agrega estas tres:
   - `https://TU-PROYECTO.supabase.co/auth/v1/callback` (lo ves en Supabase → Providers → Google como "Callback URL")
   - `TU_URL/api/google/callback`
   - `http://localhost:3000/api/google/callback`

   Copia el **ID de cliente** y el **Secreto del cliente**.
7. En Supabase → **Authentication → Providers → Google**: actívalo y pega el mismo ID y secreto. Guarda.

#### ¿Por qué el modo "Testing"?

Los permisos de Gmail son de los que Google llama "restringidos". Para que cualquier persona pueda usar una app con esos permisos, Google exige una verificación formal (revisión de la app y, a veces, una auditoría de seguridad de pago). Como esta app es solo para ti, no hace falta: en modo **Testing** solo pueden entrar los usuarios de prueba que tú agregues, y nadie más.

El costo de este modo: **Google hace que el permiso caduque cada 7 días.** Cuando pase, el panel te mostrará "Reconectar" en la sección de conexiones y el resumen del día avisará que no pudo leer el correo. Es un clic. Si prefieres no hacerlo cada semana, puedes cambiar el estado a **En producción** sin verificar: Google mostrará una pantalla de "app no verificada" al conectar (das clic en *Avanzado → Ir a Panel de Vida*), el límite es de 100 usuarios y el permiso ya no caduca cada semana.

### 4. Anthropic y Resend

1. **Anthropic**: en [console.anthropic.com](https://console.anthropic.com) → **API Keys** → crea una llave. Necesitas saldo en la cuenta.
2. **Resend**: crea tu cuenta en [resend.com](https://resend.com) **con el mismo correo que usarás en el panel** → **API Keys** → crea una llave. Sin dominio propio, Resend solo deja enviar correos a tu propio correo desde `onboarding@resend.dev`, que es justo lo que necesitamos.

### 5. Variables de entorno en Vercel

En Vercel → tu proyecto → **Settings → Environment Variables**, agrega estas (para *Production*, *Preview* y *Development*):

| Variable | Valor |
| --- | --- |
| `ALLOWED_EMAIL` | Tu correo de Google (el único que puede entrar) |
| `TIMEZONE` | `America/Mexico_City` |
| `PRIORITY_SENDERS` | Correos prioritarios separados por comas (puede ir vacío) |
| `APP_URL` | `TU_URL` (sin `/` al final) |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave `service_role` |
| `GOOGLE_CLIENT_ID` | ID de cliente de Google |
| `GOOGLE_CLIENT_SECRET` | Secreto del cliente de Google |
| `ANTHROPIC_API_KEY` | Llave de Anthropic |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
| `RESEND_API_KEY` | Llave de Resend |
| `RESEND_FROM` | `Panel de Vida <onboarding@resend.dev>` |
| `CRON_SECRET` | Una clave larga al azar (ver abajo) |
| `TOKEN_ENCRYPTION_KEY` | Otra clave larga al azar, distinta |

Para generar las dos claves al azar: en una terminal `openssl rand -base64 32`, o en [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32). **No cambies `TOKEN_ENCRYPTION_KEY` después**: si cambia, tendrás que reconectar Google.

Después: **Deployments → ⋯ → Redeploy**.

### 6. Primer uso

1. Abre `TU_URL` → **Entrar con Google** con tu correo.
2. En la agenda presiona **Conectar Google** y acepta los permisos de solo lectura.
3. Agrega una tarea de prueba, por ejemplo "pagar luz el viernes".
4. Presiona **Enviar resumen ahora** y revisa tu correo.

---

## Resumen matutino automático

`vercel.json` programa `/api/cron/daily-brief` todos los días a las **12:00 UTC = 6:00 am de Ciudad de México**. La ruta solo responde si Vercel manda el encabezado `Authorization: Bearer CRON_SECRET`, y no envía dos resúmenes el mismo día.

En el plan gratis (Hobby), Vercel corre el cron **en algún momento dentro de esa hora** (entre 6:00 y 6:59). Si tienes plan Pro y lo quieres exacto a las 6:45, cambia el horario a `45 12 * * *`.

Para cambiar la hora: convierte tu hora local a UTC (Ciudad de México es UTC−6, sin horario de verano) y edita `schedule` en `vercel.json`.

## Instalación local (opcional)

Necesitas Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local   # y llena los valores, con APP_URL=http://localhost:3000
npm run dev                  # abre http://localhost:3000
```

Otros comandos: `npm run build` (compila) y `npm run typecheck` (revisa tipos).

Para probar el cron en local:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" "http://localhost:3000/api/cron/daily-brief?force=1"
```

## Estructura

```
app/
  page.tsx                     Panel (todas las secciones)
  actions.ts                   Acciones del servidor: tareas y "Enviar resumen ahora"
  login/, acceso-denegado/     Pantallas de acceso
  auth/callback, auth/signout  Login con Supabase + Google
  api/google/connect|callback  Permiso de Calendar y Gmail (refresh token cifrado)
  api/cron/daily-brief         Resumen matutino (protegido con CRON_SECRET)
components/                    Secciones y componentes de interfaz
lib/
  google.ts                    OAuth, renovación automática del access token
  calendar.ts                  Eventos, conflictos y tiempo libre
  emails.ts                    Lectura de Gmail y clasificación con IA
  tasks.ts                     Tareas y lectura en lenguaje natural
  alerts.ts                    Alertas cruzadas y "hoy en una línea"
  brief.ts, resend.ts          Resumen y envío por correo
  crypto.ts                    Cifrado AES-256-GCM del refresh token
supabase/migrations/           Tablas y políticas RLS
proxy.ts                       Protege todas las páginas: solo tu correo entra
vercel.json                    Programación del cron
```

## Seguridad

- Solo `ALLOWED_EMAIL` puede entrar; cualquier otra cuenta ve "acceso denegado" y su sesión se cierra.
- Todas las tablas tienen RLS: cada fila solo es visible para su dueño.
- El refresh token de Google se guarda cifrado con AES-256-GCM; la llave vive solo en Vercel.
- Todas las llaves están en variables de entorno, nunca en el código.
- Para quitarle el acceso a la app en cualquier momento: [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Notas de diseño

- Los componentes (`components/ui`) siguen el estilo de shadcn/ui, escritos a mano con las mismas utilidades (`class-variance-authority`, `tailwind-merge`). Puedes agregar más con `npx shadcn@latest add <componente>`.
- Las tablas incluyen unas columnas extra en `email_classifications` (`asunto`, `remitente`, `menciona_reunion`, `tiene_hora`, `ultimo_mensaje_at`) para que el resumen y las alertas no tengan que volver a consultar Gmail.
- Para calcular tiempo libre se usa un horario de 8:00 a 20:00 (`WORKDAY_START` y `WORKDAY_END`) y se estima 30 min por tarea.
