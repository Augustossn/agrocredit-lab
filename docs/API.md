# Exemplos de API local

Contrato: `GET http://127.0.0.1:3000/api/openapi.json`. Referência: `/api/docs`. No PowerShell use `curl.exe` para evitar aliases antigos. Substitua `<TOKEN>`, `<PROPERTY_ID>`, `<REQUEST_ID>`, `<DOCUMENT_ID>` e `<EVENT_ID>` por valores retornados localmente; não são credenciais AWS.

```sh
curl -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"solicitante@agrolab.test","password":"Ficticio!2026"}'
curl http://127.0.0.1:3000/api/producers -H 'Authorization: Bearer <TOKEN>'
curl -X POST http://127.0.0.1:3000/api/requests -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' -d '{"propertyId":"<PROPERTY_ID>","amount":"25000.10","purpose":"Safra fictícia de soja","months":36,"revenue":"240000.00","costs":"100000.00","debt":"5000.00"}'
curl 'http://127.0.0.1:3000/api/requests?status=DRAFT&page=1&limit=10&sort=amount&direction=desc' -H 'Authorization: Bearer <TOKEN>'
curl -X POST http://127.0.0.1:3000/api/requests/<REQUEST_ID>/documents -H 'Authorization: Bearer <TOKEN>' -F 'file=@documento-ficticio.pdf;type=application/pdf'
curl -X POST http://127.0.0.1:3000/api/requests/<REQUEST_ID>/submit -H 'Authorization: Bearer <TOKEN>'
curl http://127.0.0.1:3000/api/requests/<REQUEST_ID> -H 'Authorization: Bearer <TOKEN>'
curl http://127.0.0.1:3000/api/requests/<REQUEST_ID>/documents/<DOCUMENT_ID>/download -H 'Authorization: Bearer <TOKEN>'
```

Entre como analista fictício para decidir após o worker gerar a recomendação:

```sh
curl -X POST http://127.0.0.1:3000/api/requests/<REQUEST_ID>/decision -H 'Authorization: Bearer <TOKEN_ANALISTA>' -H 'Content-Type: application/json' -d '{"status":"APPROVED","justification":"Capacidade sintética revisada e aprovada para demonstração."}'
curl -X POST http://127.0.0.1:3000/api/requests/<REQUEST_ID>/events/<EVENT_ID>/replay -H 'Authorization: Bearer <TOKEN_ANALISTA>' -H 'Content-Type: application/json' -d '{"reason":"Falha local corrigida; reprocessamento autorizado para demonstração."}'
curl -X POST http://127.0.0.1:3000/api/auth/logout -H 'Authorization: Bearer <TOKEN>'
```

Reprocessamento só funciona para evento morto sem resultado e antes de uma decisão final. `GET /api/requests/:id` inclui tentativas, documentos e auditoria. A correlação é gerada no servidor; resposta contém `x-correlation-id`. Erros seguem `{statusCode, message, correlationId}`. `message` pode ser uma lista de erros de validação.

| Código | Significado |
| --- | --- |
| 200 / 201 | Consulta / comando concluído |
| 400 | DTO, formato financeiro ou documento inválido |
| 401 | Sem sessão válida |
| 403 | Papel não autorizado ou limite de login |
| 404 | Recurso inexistente ou fora do escopo do usuário |
| 409 | Transição, edição ou reprocessamento incompatível com o estado |
| 413 | Arquivo maior que o limite |
| 503 | Health check detectou componente indisponível |

Não compartilhe tokens e URLs temporárias. Arquivos e identificadores deste laboratório são sintéticos.
