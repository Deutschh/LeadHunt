# Reset administrativo local de senha

Esta é uma operação manual de manutenção para o período em que o envio do e-mail
de recuperação ainda não está disponível. A ferramenta não cria rota HTTP, conta,
senha padrão ou bypass de autenticação.

## Execução

Em um terminal interativo, entre na pasta `Api` e execute:

```powershell
npm run maintenance:reset-password -- --email "admin@seu-dominio.com"
```

A ferramenta solicitará em prompts sem eco:

1. a URL de conexão PostgreSQL;
2. a nova senha;
3. a confirmação da nova senha.

Se `LEADHUNT_MAINTENANCE_DATABASE_URL` já estiver definido no ambiente do processo,
o primeiro prompt será omitido. A ferramenta deliberadamente não carrega `.env`.
Não informe a senha ou a URL como argumento de linha de comando.

Antes de confirmar a execução, confira cuidadosamente o e-mail e o ambiente de
banco selecionado. O e-mail é obrigatório e deve identificar exatamente um
usuário. Usuário inexistente ou resultado ambíguo aborta a transação.

## Efeito

A operação reutiliza a política atual de senha e a implementação Argon2id do Auth.
Em uma única transação:

- bloqueia o usuário identificado pelo e-mail normalizado;
- atualiza somente `password_hash`, `auth_version` e `updated_at`;
- incrementa `auth_version` uma vez;
- revoga todos os refresh tokens ainda ativos com o mesmo motivo usado pela
  recuperação normal de senha.

`is_admin`, memberships, workspaces, perfis e dados comerciais não são alterados.
Access tokens anteriores deixam de ser aceitos por divergência de `auth_version`.
A ferramenta imprime somente sucesso ou erro sanitizado; nunca senha, hash, token
ou URL de conexão.

Após a execução, valide um login com a nova senha em uma janela privada. A senha
anterior e refresh tokens existentes devem falhar. Se a conta alvo estiver errada,
não existe rollback automatizado da senha: execute novamente para o e-mail correto
e restaure a conta afetada com uma nova senha segura.
