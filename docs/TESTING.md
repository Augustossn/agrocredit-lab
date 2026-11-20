# Estratégia de testes

| Camada | Arquivo | O que prova |
| --- | --- | --- |
| Domínio | `tests/domain.spec.ts` | Decimais, limites, regras determinísticas, transições e assinatura/tamanho de arquivo |
| Configuração | `tests/safety.spec.ts` | Bloqueio de destinos externos/AWS, perfis e credenciais reais; separação de testes |
| Auth | `tests/auth.spec.ts` | Hash bcrypt, token opaco, expiração e regra de papel |
| Autorização de documentos | `tests/credit.spec.ts` | Proprietário é filtrado antes de tocar armazenamento; analista não faz upload |
| Confirmação do worker | `tests/processor.spec.ts` | Ordem commit/ACK, retry sem ACK, DLQ antes do ACK e quarentena |
| HTTP dos adaptadores | `tests/adapters.spec.ts` | Upload/download por SDK S3, presign, envio/recebimento/visibilidade/ACK da fila |
| Integração real | `tests/integration.spec.ts` | API Nest/Prisma/PostgreSQL, transações, concorrência/duplicatas, decisões, isolamento de documentos e DLQ/replay |
| SQL isolado | `tests/sql-contract.sql` | Precisão NUMERIC, constraints e rollback no PostgreSQL de teste |
| UI completa | `e2e/main.spec.ts` | Jornada solicitante/analista, documento, worker, histórico e layout móvel sem requests externos |

Os testes unitários usam doubles onde a pergunta é sobre um contrato de aplicação. Isso **não** prova persistência nem comportamento real da fila. A suíte de integração usa PostgreSQL e adaptadores HTTP reais e deve passar antes de declarar a jornada validada. O teste de duplicata concorrente exige exatamente uma auditoria `ANALYZED`; não se limita a contar chamadas em mock.

`test:integration` interrompe se a infraestrutura ou geração Prisma falhar. O controlador não deve executar teste contra `agrocredit` ou emuladores de desenvolvimento. Os cenários criados são exclusivos do banco isolado e preservados para inspeção; não há limpeza destrutiva de banco. Para um ciclo limpo, remova apenas o conjunto de teste conforme README.

Para contratos HTTP separadamente, exporte o mesmo ambiente de teste usado em `scripts/control.mjs`, defina `RUN_ADAPTERS=1` e execute `npx jest tests/adapters.spec.ts --runInBand`. Para integração, `RUN_INTEGRATION=1` habilita a suíte depois de migrations/seed. No PowerShell, variáveis são `$env:NOME='valor'`; em shell POSIX, `export NOME=valor`.

O teste SQL precisa do cliente `psql`, banco `agrocredit_test`, porta 55433, migration já aplicada e usuário do cluster de teste. Execute com `-v ON_ERROR_STOP=1 -f tests/sql-contract.sql`. Ele confirma ambiente no SQL antes de alterar qualquer linha e termina em rollback.

Consulte [VALIDATION.md](VALIDATION.md) para o que realmente foi executado nesta entrega; suites skipped e testes bloqueados nunca contam como aprovados.
