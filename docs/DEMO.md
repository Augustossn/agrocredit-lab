# Demonstração de cinco minutos

Antes de demonstrar, execute a aplicação e os testes em ambiente capaz de iniciar todos os componentes. Se algum item não tiver sido validado, use `VALIDATION.md` e comunique a limitação em vez de representar uma jornada como concluída.

| Tempo | Ação e mensagem |
| --- | --- |
| 0:00–0:40 | Apresente o problema: documentos dispersos, status pouco claros e dificuldade de auditar decisões. Mostre o aviso de dados fictícios e explique que é projeto pessoal com emulação local de serviços AWS. |
| 0:40–1:40 | Entre como solicitante. Mostre dashboard, produtores e filtros. Crie um rascunho com `25000.10`, receita sintética e prazo de 36 meses. Edite a finalidade. |
| 1:40–2:30 | Anexe um PDF fictício, faça download e explique proprietário, chave gerada pelo servidor e URL temporária. Envie para análise e mostre a mudança de status. |
| 2:30–3:20 | Mostre recomendação, correlação e auditoria. Explique que a regra é determinística e não aprova crédito. Mostre que o worker é outro processo local. |
| 3:20–4:10 | Saia e entre como analista. Decida com justificativa, mostre o estado final e o histórico. Tente reenviar para evidenciar a transição recusada. |
| 4:10–5:00 | Mostre testes de duplicata, retry/DLQ e diagrama. Termine com a comparação conceitual com S3/SQS/RDS, deixando claro que não houve deploy AWS. |

# Perguntas de entrevista e respostas

**Por que escolheu um monólito modular?** O domínio é pequeno e precisa de consistência transacional. Separar aplicação, domínio e adaptadores permite evoluir sem pagar o custo operacional de microsserviços. O worker separado resolve a necessidade de processamento assíncrono.

**Como evitou perder um evento depois de enviar a solicitação?** O envio e a criação da outbox ficam na mesma transação PostgreSQL. O worker publica o evento e só depois marca seu despacho. Pode haver duplicação após uma falha, então o consumo é idempotente.

**Por que não promete exatamente uma vez?** A fila pode entregar mensagens repetidas. O que o código busca é um único efeito de negócio por eventId, com locks e resultado persistido na mesma transação. ACK acontece após o commit.

**O que acontece se o worker cair após commit e antes do ACK?** A mensagem reaparece. O novo processamento encontra `processedAt`, não gera outra recomendação/auditoria e confirma a mensagem.

**E se cair antes do commit?** A transação é revertida; não há `processedAt`. A próxima entrega pode aplicar o resultado.

**Como trata falhas persistentes?** O aplicativo registra três tentativas e manda metadados à DLQ antes de confirmar a mensagem original. O broker também tem redrive após cinco recebimentos para falhas em que o banco não consegue registrar tentativas.

**Como reprocessa?** Somente analista, com justificativa, pode reabrir evento morto ainda sem resultado e sem decisão final, limitado a três reprocessamentos. Tentativas anteriores e auditoria permanecem.

**Como mantém precisão monetária?** API usa strings decimais, domínio usa Prisma.Decimal e PostgreSQL usa NUMERIC(16,2). `0.10 + 0.20` é `0.30`, sem depender de floats de JavaScript.

**Como previne IDOR?** As consultas de solicitações e propriedades aplicam proprietário no backend. Download verifica o mesmo escopo antes de consultar objeto ou emitir URL. Perfil de analista é obtido da sessão, nunca do payload.

**Por que token opaco em vez de JWT?** O ambiente é local, pequeno e já usa PostgreSQL. Sessão opaca permite revogar imediatamente por linha de banco, com expiração simples e sem gestão de chaves JWT. O navegador guarda o token só em memória.

**Como protege os documentos?** Checa autorização, formatos e limites no backend, gera chaves e emite URLs curtas. Isso demonstra regras da aplicação; Moto não prova segurança de IAM ou privacidade contra processos locais.

**O que realmente foi validado na AWS?** Nada foi implantado nem operado na AWS. É projeto pessoal com emulação local de serviços AWS. O conhecimento transferível está em contratos, filas, consistência, idempotência e observabilidade; infraestrutura e IAM reais exigiriam validação separada.

**Quais limitações você reconhece?** Emuladores efêmeros, ausência de antivírus, possibilidade de objetos órfãos em queda entre S3 e metadados, auditoria não imutável contra DBA e ausência de recuperação automatizada para redrive pelo broker durante indisponibilidade prolongada do banco. Consulte também os bloqueios de execução registrados.
