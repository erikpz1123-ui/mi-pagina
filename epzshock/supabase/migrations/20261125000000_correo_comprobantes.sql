-- Correo donde el entrenador recibe los comprobantes de transferencia
alter table public.ajustes
  add column if not exists correo text check (char_length(correo) <= 120 and correo ~* '^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$');
