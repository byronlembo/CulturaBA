import {
  accountErrorMessage,
  parseAuthRedirect,
  passwordProblem,
  redirectErrorMessage,
} from './account';

describe('passwordProblem', () => {
  it('pide 8 caracteres con letras y números', () => {
    expect(passwordProblem('abc123')).toBe('Usá al menos 8 caracteres.');
    expect(passwordProblem('solamenteletras')).toBe('Mezclá letras y números.');
    expect(passwordProblem('12345678')).toBe('Mezclá letras y números.');
    expect(passwordProblem('teatro2026')).toBeNull();
  });
});

describe('parseAuthRedirect', () => {
  it('lee los tokens del fragmento (flujo implícito)', () => {
    const r = parseAuthRedirect(
      'culturaba://cuenta#access_token=AT&refresh_token=RT&expires_in=3600&token_type=bearer',
    );
    expect([r.accessToken, r.refreshToken, r.code, r.errorCode]).toEqual(['AT', 'RT', null, null]);
  });

  it('lee el código PKCE de la query', () => {
    expect(parseAuthRedirect('https://x.test/cuenta?code=abc').code).toBe('abc');
  });

  it('lee el error de Google tanto en la query como en el fragmento', () => {
    const q = parseAuthRedirect(
      'https://x.test/cuenta?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked',
    );
    expect([q.errorCode, q.errorDescription]).toEqual([
      'identity_already_exists',
      'Identity is already linked',
    ]);
    const h = parseAuthRedirect('https://x.test/cuenta#error=access_denied&error_description=x');
    expect(h.errorCode).toBe('access_denied');
  });

  it('una URL sin nada no trae ni sesión ni error', () => {
    expect(redirectErrorMessage('https://x.test/cuenta')).toBeNull();
  });
});

describe('accountErrorMessage', () => {
  it('traduce los códigos de Supabase Auth', () => {
    expect(accountErrorMessage({ code: 'invalid_credentials', message: '' })).toBe(
      'Email o contraseña incorrectos.',
    );
    expect(
      redirectErrorMessage('https://x.test/cuenta?error_code=identity_already_exists')?.message,
    ).toMatch(/ya está registrada/);
    expect(accountErrorMessage({ message: 'boom' })).toBe('No se pudo completar: boom');
  });
});
