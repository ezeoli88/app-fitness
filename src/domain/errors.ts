/** Error de dominio que la API traduce a 409 (conflicto) o 422 (datos inválidos). */
export class DomainError extends Error {
  readonly status: 409 | 422;

  constructor(message: string, status: 409 | 422 = 409) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}
