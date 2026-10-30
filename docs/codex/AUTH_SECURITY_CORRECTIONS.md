# Correções transversais de Auth — 2026-10-30

## Cadastro e OTP

Cadastro de usuário não verificado substitui atomicamente nome, hash Argon2id e
aceites pelos dados da nova tentativa, sob lock do usuário. Invalida challenges
abertos da tentativa anterior. Usuário verificado nunca é sobrescrito.

A resposta genérica 202 de register acrescenta verificationAttempt, uma prova
opaca HMAC com separação de domínio, vinculada a user_id e ao hash Argon2id daquela
tentativa. Para conta já verificada, retorna um decoy aleatório de mesmo formato,
sem indicar existência ou estado. Nenhum ID interno, senha ou hash é exposto.

Verify e resend exigem verificationAttempt no body. O backend compara a prova
com as credenciais atuais e o digest de OTP também é vinculado a ela. Assim:

- senha A de pré-cadastro não é ativada pelo OTP da tentativa B;
- OTP antigo não confirma credenciais novas;
- uma prova da aba B não confirma o OTP de um cadastro C posterior;
- resend antigo não cria um novo código que legitime credenciais de outra tentativa;
- confirmação repetida conserva a janela idempotente existente, com a prova correta.

Não basta atualizar a senha e invalidar códigos: sem prova no navegador, um
cadastro C poderia enviar um código posterior e a vítima B digitá-lo em sua aba.
A prova fecha essa corrida sem acrescentar schema. O hash Argon2 usa salt aleatório,
de modo que até um novo cadastro com a mesma senha recebe vínculo novo.

Cooldown e quota contam também códigos invalidados. Substituir credenciais não
reinicia limites nem força novo envio durante cooldown. A nova tentativa pode
usar resend depois da espera normal; tentativas antigas não podem fazê-lo.

O App guarda a prova somente em memória privada do AuthProvider. Não vai para
URL, history state, storage, logs ou snapshot público. Senha não é transportada
entre páginas. Ao confirmar, a prova correspondente é removida. Se a aba for
recarregada/fechada ou o fluxo for aberto diretamente, deve-se reiniciar o cadastro
pelo link existente. Essa restrição é deliberada; não existe fallback email+OTP.

## Login

Bootstrap inicial e login interativo são estados distintos. Durante login o
controller publica anonymous com loginPending, mantendo LoginPage montada e seu
loading local. Falhas de login ou do /me interativo ficam no formulário, sem
timeout visual, reset de campos ou navegação. Bootstrap inicial mantém suas
telas de loading/indisponibilidade. authEpoch e sessionVersion continuam isolando
sessões e descartando respostas antigas.

## Refresh concorrente

O transporte usa um Web Lock exclusivo de mesmo nome/origin para login, refresh,
logout e reset de senha, cobrindo o request e a aplicação do Set-Cookie. Cada aba
usa o cookie atual ao obter o lock; JWTs, cookies e identidades não são enviados
por canal entre abas nem persistidos no cliente.

AbortSignal cancela a espera pelo lock, mas não interrompe um request de cookie
já enviado: o lock é mantido até a resposta HTTP limitada por timeout terminar.
Isso impede liberar login/logout novo enquanto a resposta antiga ainda pode
aplicar Set-Cookie. authEpoch descarta o resultado antigo. Leituras /me e operações
normais continuam abortáveis.

No servidor, a rotação continua estrita. Um refresh já rotacionado pode receber
somente 409 REFRESH_COLLISION durante até 3 segundos contados da rotação original,
se ainda houver um sucessor ativo na família, não expirado e da auth_version atual.
Esse caminho não emite access/refresh, não modifica/limpa cookie, não renova a
janela e não autentica o portador do token antigo. Fora dessa condição, replay
revoga a família como antes. Logout e mudança de senha/version nunca são cobertos
por essa tolerância.

Sem Web Locks, há serialização no mesmo realm e tratamento server-side limitado
da colisão entre abas. O cliente repete somente REFRESH_COLLISION, no máximo duas
vezes (100/200 ms), relendo o cookie em cada request. INVALID_SESSION não é
repetido. Se o cookie vencedor ainda não chegou, permanece indisponibilidade
recuperável, sem revogar a família ou limpar a sessão vencedora. Não há retry infinito.

## Compatibilidade e rollout

- Nenhuma migration necessária; 007/008 permanecem intactas.
- Publicar API e App coordenadamente: verify/resend agora exigem a prova.
- Cadastros ainda não verificados e abas antigas devem reiniciar o cadastro.
- Contas já verificadas preservam suas credenciais. A correção não reescreve
  senhas históricas; casos previamente comprometidos exigem recuperação de senha.
- Não foram alterados /account, Admin, gates de pending/suspended ou regras de workspace.
- Sem dependências novas, commit/push, leitura de .env ou serviços reais.

## Validação

No diretório Api, sempre com ambiente seguro nos testes que importam bootstrap:

    node --require ./test/helpers/safeTestEnvironment.js --test "test/*.test.js"
    node --test test/integration/authSecurity.postgres.js
    node --test test/integration/stage7.postgres.js

As integrações criam seu próprio PostgreSQL 17+ descartável via helper existente,
sem conectar a instância local habitual nem banco remoto. Nenhuma migration é
alterada: baseline/migrations são aplicados somente nesse cluster de fixtures,
que é encerrado e removido ao final. Nenhum e-mail, navegador ou envio é iniciado.

No diretório App:

    npm test
    npm run lint
    node --input-type=module -e 'import { build } from "vite"; await build({ envFile: false });'

O build programático usa a configuração Vite normal, com leitura de arquivos .env
explicitamente desativada. Conferir também node --check nos JS alterados e
git diff --check. Smoke manual: senha errada mantém campos/erro no login; duas abas
da mesma sessão iniciam e renovam sem logout; trocar senha/logout invalida refresh;
cadastro B confirma somente senha B. Usar apenas identidades descartáveis e nunca
editar dados reais para reproduzir ataque. Testes automatizados limpam suas fixtures.
