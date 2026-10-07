# Formación Para Todos — Bot WhatsApp

Bot de WhatsApp con IA para vender la biblioteca digital de libros técnicos de [formacionparatodos.online](https://formacionparatodos.online) (IA/ML, Datos, DevOps, Cloud, Seguridad, etc.). La IA se llama **Valeria** y hace toda la venta: navega el catálogo, propone libros y envía el link de pago.

Cada libro cuesta **$20.000 COP**. El bot envía al cliente el link de la página pública del libro; el checkout de **Bold** (Nequi, PSE, tarjeta, Daviplata) corre en la web, y Resend entrega el EPUB/PDF por correo al confirmar el pago.

---

## Stack

- **Runtime:** Node.js 24 + Express
- **IA:** Groq API — modelo `openai/gpt-oss-20b` (con function calling)
- **Mensajería:** WhatsApp Cloud API (Meta)
- **Pagos / entrega:** delegados al sitio `formacionparatodos.online` (Bold + Resend)
- **Catálogo:** `data/catalog.json` (sincronizado desde `libros.json` del sitio)

---

## Infraestructura

| Servicio | Detalle |
|---|---|
| GitHub | `https://github.com/Pablo-app-developer/bot_whatsapp_libros` |
| Dominio público | `formacionparatodos.online` |
| Número WhatsApp | `+57 318 927 7573` |
| Phone Number ID | `1143854128805185` |
| WABA ID | `4296970973856614` |
| Webhook WA | `.../webhook` — token: `streamflow_token_2024` |

---

## Variables de entorno

```
WHATSAPP_API_TOKEN              → token permanente de System User (no expira)
WHATSAPP_PHONE_NUMBER_ID        → 1143854128805185
WHATSAPP_BUSINESS_ACCOUNT_ID    → 4296970973856614
WHATSAPP_WEBHOOK_VERIFY_TOKEN   → streamflow_token_2024
GROQ_API_KEY                    → empieza con gsk_
WEB_BASE_URL                    → https://formacionparatodos.online
ADMIN_PHONE                     → 573214498647
ADMIN_KEY                       → !admin
NODE_ENV                        → production
```

---

## Catálogo — `data/catalog.json`

**Fuente de verdad**: `libros.json` del repo `pagina_libros_oreilly_repo`. Regenerar con:

```js
const libros = require('../pagina_libros_oreilly_repo/libros.json')
  .filter(l => l.disponible && l.drive_url && l.idioma === 'ES')
  .sort((a,b) => (a.tema||'').localeCompare(b.tema||'') || (a.titulo||'').localeCompare(b.titulo||''));
const out = libros.map((l,i) => ({ id: i+1, category: l.tema, title: l.titulo, url: l.drive_url, slug: l.slug }));
```

Hoy: **433 libros ES, 17 categorías**. Los 386 EN quedan fuera (no tienen `drive_url` — viven en R2 y necesitan `api/download.js` para servirse). Pendiente integrar en una siguiente ronda.

Cada entrada: `{ id, category, title, url, slug }`. `slug` es la clave para el link `/libro/<slug>` del sitio.

---

## Arquitectura

```
WhatsApp usuario
      ↓
Meta Cloud API
      ↓
POST /webhook
      ↓
whatsappController.js
      ├── isAdminCommand? → adminService.js
      └── getAIResponse → geminiService.js (Groq + tools)
              │
              ├── tool: list_books(category)   → catalogService.listBooksByCategory
              ├── tool: search_books(query)    → catalogService.searchBooks
              └── tool: send_payment_link(id)  → devuelve { text, action }
                          │
                          ↓
                    paymentService.getPaymentLink → URL formacionparatodos.online/libro/<slug>
                          │
                          ↓
                    sendWhatsAppMessage: "Link de pago: ... — libro llega por correo"
```

El pago y la entrega del PDF/EPUB **no pasan por el bot**: el cliente abre el link, paga con Bold en la web, y Resend le manda el libro por email.

**Ventaja del function calling**: el LLM decide por contexto cuándo mostrar categorías, cuándo buscar y cuándo enviar el link. No hay regex de intent.

---

## Comandos admin (desde WhatsApp del admin)

```
!admin ayuda
!admin stats
```

> Nota: `adminService` / `inventoryService` / `orderService` heredan del proyecto anterior (venta de cuentas de streaming) y aún no se adaptaron a comandos útiles para libros. Pendiente decidir si se eliminan o se reutilizan.

---

## Correr localmente

1. `cp .env.example .env` y rellenar.
2. `npm install`
3. `start-whatsapp-bot.bat` (o `npm start`)
4. En otra terminal: `ngrok http 3001` → copiar la URL HTTPS al webhook de Meta.

---

## Fixes aprendidos

- `GROQ_API_KEY` debe empezar con `gsk_`.
- `WHATSAPP_API_TOKEN` debe ser **token permanente de System User** (Business Manager → Usuarios del sistema). Los del App Dashboard expiran en 24h.
- `WABA` suscripción se activa vía `POST /v21.0/{wabaId}/subscribed_apps`. La UI de Meta no lo hace sola.
- `gpt-oss-20b` usa formato Harmony y a veces expone `msg.reasoning` (chain-of-thought). **Nunca** enviar ese campo al usuario; solo `msg.content`.

---

## Pendiente

- Añadir packs al bot (6 packs temáticos de $100.000 COP cada uno — `packs.json` del sitio).
- Incluir libros en inglés (requiere URL de entrega alternativa, no `drive_url`).
- Decidir destino de `adminService` / `inventoryService` / `orderService` (comandos legacy del negocio Netflix).
- Deploy 24/7 (actualmente se corre local + ngrok).
