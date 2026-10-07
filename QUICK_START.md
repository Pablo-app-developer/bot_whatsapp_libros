# Quick Start

Guía práctica para trabajar con este bot. Para arquitectura completa ver `README.md`.

---

## Correr en local

```bash
npm install
cp .env.example .env   # y completa las variables
npm start
```

El servidor arranca en `http://localhost:3001`. Endpoints útiles:

- `GET /health` → status + variables detectadas
- `GET /webhook` → verificación Meta (usa `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
- `POST /webhook` → mensajes entrantes de WhatsApp

Para probar con WhatsApp real necesitas exponer el puerto: `ngrok http 3001` y configurar la URL HTTPS en Meta for Developers.

---

## Estructura del proyecto

```
bot_whatsapp_libros/
├── server.js                        → Express app + rutas
├── data/
│   ├── catalog.json                 → 433 libros (id, categoría, título, url Drive, slug)
│   ├── orders.json                  → (legacy — no se escribe en flujo D1)
│   └── clients.json                 → (legacy — no se escribe en flujo D1)
├── controllers/
│   └── whatsappController.js        → handler principal /webhook
└── services/
    ├── geminiService.js             → IA Valeria (Groq + function calling)
    ├── catalogService.js            → listCategories / listBooksByCategory / searchBooks
    ├── paymentService.js            → genera URL formacionparatodos.online/libro/<slug>
    ├── whatsappService.js           → envío + mark-as-read via Meta API
    └── adminService.js              → comandos !admin (legacy, usa order/inventoryService)
```

---

## Cómo agregar/quitar libros

El catálogo del bot vive en `data/catalog.json`. **Fuente de verdad**: `libros.json` del repo `pagina_libros_oreilly_repo`. Para resincronizar:

```js
const libros = require('../pagina_libros_oreilly_repo/libros.json')
  .filter(l => l.disponible && l.drive_url && l.idioma === 'ES')
  .sort((a,b) => (a.tema||'').localeCompare(b.tema||'') || (a.titulo||'').localeCompare(b.titulo||''));
const out = libros.map((l,i) => ({ id: i+1, category: l.tema, title: l.titulo, url: l.drive_url, slug: l.slug }));
fs.writeFileSync('data/catalog.json', JSON.stringify(out, null, 2));
```

Formato de cada entrada:

```json
{
  "id": 1,
  "category": "Arquitectura de Software",
  "title": "Aprendizaje de estilos de API",
  "url": "https://drive.google.com/drive/folders/...",
  "slug": "aprendizaje-de-estilos-de-api"
}
```

Los `id` son secuenciales (se usan por el LLM al llamar `send_payment_link`). El `slug` es la clave para armar el link `/libro/<slug>` del sitio.

---

## Cómo cambiar la personalidad / prompt de Valeria

Editar `buildSystemPrompt()` en `services/geminiService.js`. Ese archivo también define las 3 tools que el modelo puede llamar. Si cambias nombres/parámetros de tools, actualiza también `executeTool()`.

---

## Flujo de conversación (function calling)

```
Cliente: hola
  → LLM responde texto con categorías top

Cliente: quiero uno de kubernetes
  → LLM llama tool search_books("kubernetes")
  → catalogService devuelve top 8 títulos
  → LLM responde con la lista numerada

Cliente: el 2
  → LLM llama tool send_payment_link(book_id)
  → controller llama paymentService.getPaymentLink
  → bot envía: "💳 Link de pago: formacionparatodos.online/libro/<slug>...
                 📬 Al confirmar el pago, el libro te llega automáticamente a tu correo."

[cliente paga con Bold en la web → /gracias → Resend envía el libro por email]
```

Máximo 3 vueltas de tool-use por mensaje (definido en `geminiService.js`).

El bot **no** verifica el pago ni entrega el PDF; ambas cosas pasan en la web (Bold + Resend).

---

## Logs útiles

- `📩 Message from ...` → mensaje entrante
- `🛠️ Tool call: ...`   → LLM invocó una tool
- `🤖 AI Response: ...` → respuesta final al usuario
- `🔗 Link pago (web Bold)` → link enviado

---

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Bot no responde | Verificar `WHATSAPP_API_TOKEN` y que la WABA esté suscrita al app |
| IA devuelve texto raro tipo "According to rules..." | Reasoning leak — verificar que `geminiService` use `msg.content`, no `msg.reasoning` |
| Link enviado pero cliente dice que no funciona | Verificar que `GET formacionparatodos.online/libro/<slug>` responda 200 y que `l.disponible === true` en `libros.json` del sitio |
| `book_id no existe` en logs | El LLM alucinó un id — `search_books` antes de `send_payment_link` resuelve esto |
| Catálogo bot vs sitio desalineado | Regenerar `data/catalog.json` (ver sección arriba) |
