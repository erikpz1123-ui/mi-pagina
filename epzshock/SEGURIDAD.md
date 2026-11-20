# Seguridad de Epzshock

Ninguna app es 100 % inhackeable. Esta tiene varias capas de protección, todas probadas.

## Capas de protección

| Capa | Qué protege | Cómo se comprobó |
|---|---|---|
| **Base de datos (RLS)** | Cada cliente solo ve lo suyo: sus rutinas vigentes, su chat y el top público de retos; el detalle completo de un reto solo lo ve quien pagó. Nadie puede hacerse entrenador ni falsear su antigüedad. | 37 pruebas en `supabase/pruebas/` |
| **Registro solo por invitación** | El registro libre está cerrado. Las invitaciones son de un solo uso, vencen a los 14 días y tienen 72 bits de azar (imposible adivinarlas). | Prueba en vivo |
| **Funciones internas ocultas** | Las funciones de permisos viven en un esquema privado que no se puede llamar desde internet. | Revisión de seguridad de Supabase: de 9 avisos a 3 esperados |
| **Límites anti-abuso** | 60 mensajes y 40 entrenos por cliente al día; 5 solicitudes por conexión por hora y 300 al día en total; tamaño máximo de datos. | Pruebas en Postgres y en vivo |
| **Cabeceras de seguridad (CSP)** | El navegador solo ejecuta el código de la app. Bloquea la inyección de scripts, que tu app se cargue dentro de otra página (clickjacking), y el acceso a cámara, micrófono y ubicación. | Cabeceras verificadas en el sitio real, sin bloqueos |
| **CORS** | Solo tu app puede usar las funciones del servidor desde un navegador; una página ajena recibe 403. | Prueba en vivo |
| **Ataques de inyección (XSS)** | Todo lo que escriben clientes o desconocidos se muestra como texto. Los links de vídeo solo aceptan `https://`. | Ataque simulado en todos los campos: nada se ejecutó |
| **Contraseñas** | Mínimo 8 caracteres y recuperación por correo. Supabase limita los intentos de inicio de sesión. | Configuración de Supabase |
| **Sin secretos en el código** | En la app solo está la clave pública (`publishable`). Las privadas viven en el servidor. | Revisión del repositorio |
| **Eliminar cuenta** | El cliente borra su cuenta y todos sus datos. | Prueba en vivo |
| **Hosting** | Netlify sirve la app desde su red global (CDN) con HTTPS obligatorio (HSTS), resistente a picos de tráfico. | — |

## Lo que depende de ti (lo más importante)

La forma más común de "hackear" una app pequeña no es atacar el código: es **entrar a las cuentas del dueño**.

1. **Activa la verificación en dos pasos (2FA)** en:
   - Google (tu Gmail): myaccount.google.com → Seguridad → Verificación en 2 pasos.
   - Supabase: Account → Security → Multi-factor authentication.
   - Netlify: User settings → Security → Two-factor authentication.
   - GitHub: Settings → Password and authentication → Two-factor authentication.
2. **Borra las claves que se pegaron en el chat**:
   - Supabase → Project Settings → API Keys → la clave `sb_secret_...` → Delete.
   - Supabase → Account → Access Tokens → el token `sbp_...` → Revoke (cuando ya no necesitemos tocar el servidor).
   - Netlify → User settings → Applications → el token `nfp_...` → Delete (igual).
3. **Contraseña fuerte y única** para tu cuenta de entrenador (12+ caracteres, que no uses en otro sitio).
4. **Bloqueo con Face ID o código** en tu celular: tu app de entrenador guarda los datos en el teléfono.
5. **Descarga una copia de seguridad** cada semana: ⚙︎ Ajustes → Descargar copia.

## Límites honestos

- **Ataques masivos (DDoS)**: la parte web la aguanta Netlify. El servidor de datos en plan gratis tiene límites de uso: un ataque muy grande podría ralentizarlo, pero no exponer datos.
- **Contraseñas filtradas** (HaveIBeenPwned) y **quitar la insignia de Netlify** solo están en planes de pago.
- Si alguien obtiene la contraseña de un cliente, podrá ver lo de ese cliente, nunca lo de otros.
