# Epzshock — guía para publicar

Esta guía lleva la app de "funciona en modo demo" a "mis clientes se registran con mi link".
Está en orden: haz los pasos de arriba abajo.

---

## 0. Plan realista para el lunes

| Cuándo | Qué | Resultado |
|---|---|---|
| **Hoy (jueves)** | Abre tus cuentas de **Apple Developer** y **Google Play Console** (tardan días en aprobarse, empieza ya). Publica el reel/TikTok y apunta a los interesados. | Cuentas en revisión |
| **Viernes** | Paso 1 a 4: Supabase, funciones con Claude, y app web publicada en internet. | La app funciona con tu link |
| **Sábado–domingo** | Prueba con 2–3 amigos: invitación, rutina activa, chat, reto. | Todo verificado |
| **Lunes** | Envía los links de invitación a tus nuevos clientes. Se instalan la app desde el navegador ("Añadir a pantalla de inicio"). | **Clientes usando la app** |
| **Semana siguiente** | App Store: subes la app y Apple la revisa (≈ 1–2 días). | En App Store |
| **≈ 2–3 semanas** | Google Play: prueba cerrada obligatoria de **12 personas durante 14 días** (cuentas personales nuevas). Tus primeros clientes pueden ser esos testers. | En Google Play |

> Por qué no las tiendas el lunes: Apple tarda en aprobar la cuenta de desarrollador (1–2 días, más si piden documentos)
> y Google exige a las cuentas personales nuevas una prueba cerrada de 12 personas durante 14 días antes de publicar.
> La versión web es la **misma app**: se instala en iPhone y Android, funciona sin internet y no pasa por revisión.

---

## 1. Base de datos (Supabase, gratis) — 15 min

1. Crea una cuenta en **supabase.com** → *New project* (región: la más cercana a México, p. ej. `us-east`). Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor** → *New query* → pega todo el contenido de
   `supabase/migrations/20261120000000_epzshock.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: desactiva **"Allow new users to sign up"**.
   (Los clientes se registran solo con tu invitación: la función `registro` crea la cuenta por ti.)
4. Crea tu cuenta de entrenador: **Authentication → Users → Add user** (tu correo y una contraseña fuerte, marca *Auto Confirm*).
   Luego en **SQL Editor**:
   ```sql
   insert into perfiles (id, rol, nombre)
   select id, 'entrenador', 'Erik Perez' from auth.users where email = 'TU_CORREO@ejemplo.com';
   ```
5. **Settings → API**: copia la **Project URL** y la clave **anon / publishable** (la pública; nunca la `service_role`).

## 2. Funciones del servidor y Claude — 15 min

1. Crea una clave de API de Claude en **platform.claude.com** (Settings → API keys) y añade saldo.
2. En tu computadora, dentro de la carpeta `epzshock/`:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_REFERENCIA      # la referencia está en la URL del proyecto
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy
   ```
   Esto sube 5 funciones: `registro`, `solicitud`, `chat-ayuda`, `ia-entrenador` y `eliminar-cuenta`.
   (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya las tiene Supabase; no hay que configurarlas.)

## 3. Publicar la app web — 10 min

Opción rápida, **Netlify Drop** (gratis):
1. Entra a **app.netlify.com/drop** y arrastra la carpeta `epzshock/`.
2. Te da una dirección tipo `https://epzshock.netlify.app/`. (Puedes ponerle un dominio propio después.)

Opción GitHub Pages (cuando tengas acceso de GitHub conectado): *Settings → Pages → Deploy from branch*.
La dirección será `https://erikpz1123-ui.github.io/mi-pagina/epzshock/`.

## 4. Conectar la app con la nube

Edita `config.js`:
```js
window.EPZ_CONFIG = {
  supabaseUrl: 'https://TU_REFERENCIA.supabase.co',
  supabaseAnonKey: 'TU_CLAVE_ANON_O_PUBLISHABLE',
  appUrl: 'https://epzshock.netlify.app/',   // la dirección del paso 3
  demo: false,
};
```
Vuelve a publicar (arrastra otra vez la carpeta a Netlify). Abre la app → **Soy el entrenador** → entra con tu correo.
En **⚙︎ Ajustes** verás "App de clientes · nube" y tus descuentos.

## 5. Probar antes del lunes (checklist)

- [ ] Crea un cliente → ficha → **Invitar a la app** → abre el link en otro teléfono y regístrate.
- [ ] En una sesión → **📱 Activar en la app** → 1 día. El cliente la ve, pulsa **⬇ Descargar**, activa el modo avión y entrena.
- [ ] Al volver el internet, el entreno aparece en tu historial (📱).
- [ ] El cliente escribe en **Ayuda**: responde Claude. Escribe "me duele la rodilla": te aparece como "Te necesita".
- [ ] Crea un reto → **Publicar** → marca a uno como **Pagó**: él ve el progreso completo; los demás solo el top 5.
- [ ] El cliente comparte su link de **Invita a un amigo** → te llega la solicitud con "Recomendado por…".
- [ ] En **Pagos**, los clientes con 3+ meses aparecen con su descuento aplicado.

---

## 6. App Store (iPhone)

**Necesitas:** cuenta **Apple Developer** (99 USD al año) y una **Mac con Xcode**.
(Sin Mac: servicios como Codemagic o Ionic Appflow compilan en la nube.)

1. Inscríbete en **developer.apple.com/programs** (como persona física es lo más rápido).
2. En la carpeta `epzshock/tiendas/`:
   ```bash
   npm install
   npm run ios        # copia la app web, sincroniza y abre Xcode
   ```
3. En Xcode: elige tu equipo en *Signing & Capabilities*, *Product → Archive* → *Distribute App*.
4. En **App Store Connect**: crea la app (*precio: Gratis*), sube capturas, descripción y:
   - **URL de privacidad**: `https://TU-DIRECCION/privacidad.html`.
   - **Etiquetas de privacidad**: nombre, correo, teléfono, datos de fitness y mensajes, vinculados a la cuenta, **sin rastreo**.
   - **Cuenta de prueba para la revisión**: crea un cliente de prueba con una rutina activa de 4 semanas y escribe su correo y contraseña en *App Review Information* (Apple no puede entrar sin ella).

**Para que Apple la apruebe:**
- La app **no vende nada dentro**: los cobros los haces tú por fuera (efectivo, transferencia). No añadas botones de "pagar" ni precios en la app del cliente.
- La eliminación de cuenta ya está en **Perfil → Eliminar mi cuenta** (Apple la exige).
- Si Apple objetara que la app es "solo una web", destaca lo nativo: rutinas descargadas sin internet, registro de entrenos, temporizador con vibración y chat.

## 7. Google Play (Android)

**Necesitas:** cuenta de **Google Play Console** (25 USD, pago único) y **Android Studio**.

1. Regístrate en **play.google.com/console** y verifica tu identidad.
2. En `epzshock/tiendas/`:
   ```bash
   npm install
   npm run android    # copia la app web, sincroniza y abre Android Studio
   ```
3. En Android Studio: *Build → Generate Signed App Bundle* (guarda bien el archivo de firma `.jks`: sin él no podrás actualizar la app).
4. En Play Console: crea la app (*Gratis*), sube el `.aab` a **Prueba cerrada**, añade a **12 testers o más** (sus correos de Gmail) y mantenlos **14 días**. Después solicita el acceso a producción.
5. Completa **Seguridad de los datos** (los mismos datos que en Apple) y la URL de privacidad.

---

## 8. Costos

| Concepto | Costo |
|---|---|
| Supabase (plan gratis: 500 MB, 50 000 usuarios activos al mes) | 0 |
| Netlify / GitHub Pages | 0 |
| Apple Developer | 99 USD / año |
| Google Play | 25 USD una vez |
| Claude (chat de ayuda de clientes) | ≈ 0.02 USD por mensaje (≈ 3,000 tokens de entrada y 250 de salida con Claude Opus 5.5) |

Ejemplo: 50 clientes que mandan 2 mensajes al día ≈ 3,000 mensajes al mes ≈ **60 USD/mes**.
Para controlarlo tienes el límite de **mensajes por cliente al día** en ⚙︎ Ajustes → Descuentos (por defecto 20).
Si quieres bajar mucho el costo, el chat de clientes puede usar un modelo más económico: es un cambio de una línea en `supabase/functions/_shared/claude.ts`; pídemelo y lo ajustamos.

> El plan gratis de Supabase pausa el proyecto si pasa 7 días sin uso. Con clientes activos no ocurre; si te vas de vacaciones, entra una vez a la app.

---

## 9. Seguridad: qué está garantizado

- El **registro** solo funciona con una invitación válida, de un solo uso, que vence a los 14 días.
- Un cliente **solo ve sus rutinas vigentes**: al vencer desaparecen, también la copia descargada.
- El **detalle de un reto** solo lo ve quien tú marcaste como "Pagó"; el **top 5** lo ven todos los clientes activos.
- La **IA del entrenador** solo responde a tu cuenta (rol `entrenador`, comprobado en el servidor).
- Si **pausas** a un cliente, pierde el acceso al instante.
- Todo lo impone la base de datos (RLS) y está probado: `supabase/pruebas/` (30 casos).
