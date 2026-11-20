# Versões selecionadas

Consulta oficial e seleção em 20/11/2026. Não se usa `latest` nas dependências diretas ou imagens. Versão fixada não significa que foi possível baixar e executar todos os componentes neste ambiente.

| Componente | Versão | Licença principal | Observação |
| --- | --- | --- | --- |
| Node.js | 24.16.0 executado | MIT | Requisito 22.12+ / 24 |
| npm | 11.13.0 executado | Artistic-2.0 | Instalação via cache disponível no ambiente |
| TypeScript | 5.9.3 | Apache-2.0 | Backend e frontend |
| NestJS | 11.2.7 | MIT | Common/Core/Express alinhados |
| React / React DOM | 19.3.0 | MIT | Alinhados |
| Vite | 7.3.7 | MIT | Compatível com Node selecionado |
| Plugin React Vite | 5.2.0 | MIT | Build local |
| Prisma / Prisma Client | 6.19.0 | Apache-2.0 | Versão 6 escolhida com documentação específica v6; não é a major atual |
| PostgreSQL | 17.10 | PostgreSQL License | NUMERIC e row locks |
| Moto Server | 5.2.1 | Apache-2.0 | Imagem / pacote fixados, download depende do ambiente |
| ElasticMQ | 1.7.0 | Apache-2.0 | JAR/contêiner local, sem conta/licença comercial |
| AWS SDK S3 / presigner | 3.1073.0 | Apache-2.0 | Endpoint e credenciais estáticos fictícios |
| SQS | Adaptador HTTP Query próprio | MIT | Operações do subconjunto compatível ElasticMQ |
| bcryptjs | 3.0.3 | BSD-3-Clause | Hash custo 12 |
| Jest | 29.7.0 | MIT | Backend |
| ts-jest | 29.4.14 | MIT | TypeScript |
| Playwright Test | 1.64.1 | Apache-2.0 | Chromium local |
| Contingência S3/SQS | Código deste projeto | MIT | Biblioteca padrão Python; não substitui validação Moto/ElasticMQ |

As licenças completas das dependências acompanham seus pacotes. Consulte o lockfile para dependências transitivas e seus metadados. OpenJDK/Temurin é uma opção livre para executar o JAR; não requer assinatura Java comercial. Docker Engine e Compose são as alternativas abertas previstas; Docker Desktop não integra a execução autorizada.
