-- Novas contas sempre normalizam o email, mas contas legadas podem preservar
-- caixa diferente. O indice impede uma corrida de cadastro de criar duas
-- identidades que seriam equivalentes no login case-insensitive.
CREATE UNIQUE INDEX "User_email_normalized_key"
  ON "User"(LOWER("email"))
  WHERE "email" IS NOT NULL;
