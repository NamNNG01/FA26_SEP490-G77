# Services

One file per backend area (`<area>.service.ts`), exporting one `<area>Service` object.

## Conventions for new code

- **Call through `api`** (`./api.ts`): `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete`.
  They throw when the backend answers `{ success: false }`. Use `api.request` only for
  options the shortcuts lack (e.g. a longer `timeout`), and `apiClient` only for multipart
  uploads, blobs or raw headers.
- **Name methods `verbNoun`**: `getDecks`, `getDeckById`, `createDeck`, `updateDeck`, `deleteDeck`.
  Older services use short names (`list`, `get`, `remove`); leave them until that file is reworked.
- **One name for the envelope per file**: `const res = await api.get<ApiResponse<T>>(...)`, then
  `return res.data;`.
- **Types**: `ApiResponse<T>` comes from `@/types/api`, auth DTOs from `@/types/auth`. A service's
  own DTOs live in the service file and are exported from it.
- **No duplicates**: an endpoint has one function. Questions live in `question.service`,
  question groups in `questionGroup.service`; other screens import those.
