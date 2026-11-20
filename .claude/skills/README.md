# Skills instaladas para Epzshock

Origen: [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code), licencia MIT (ver LICENCIA-ECC.txt), commit `4adeee6`.
Se instalaron **solo** las skills útiles para la app y su crecimiento, revisadas una a una. **No** se instalaron los hooks de ECC
(interceptan cada comando y mensaje), ni sus 72 agentes, ni la skill `security-scan` (requiere un paquete npm externo).

| Skill | Para qué la usaremos |
|---|---|
| ecc-security-review | Revisión de seguridad del código antes de publicar cambios (renombrada para no tapar la revisión de seguridad que ya trae Claude Code) |
| web-perimeter-owasp-2025-audit | Auditoría web OWASP 2025: cabeceras, CSP, CORS, sesiones |
| postgres-patterns | Buenas prácticas de Postgres (Supabase): índices, consultas, RLS |
| database-migrations | Migraciones seguras de la base de datos sin perder datos |
| e2e-testing | Pruebas de punta a punta con Playwright |
| accessibility | Accesibilidad (WCAG) para que cualquier cliente pueda usar la app |
| seo | Posicionamiento de la página y la app web |
| marketing-campaign | Campañas para captar clientes |
| short-video-distribution | Reels / TikTok / Shorts: formatos y distribución |
| video-editing | Guía de edición con ffmpeg (sin los scripts de DaVinci Resolve) |
| brand-voice | Voz y tono de la marca EPZSHOCK |
| content-engine | Plan y producción de contenido |

Para actualizar: volver a revisar el repositorio original y copiar las skills nuevas, nunca ejecutar su instalador completo.
