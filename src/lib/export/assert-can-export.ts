export class ExportNotAllowedError extends Error {
  constructor(message = "Export non autorisé pour votre rôle.") {
    super(message);
    this.name = "ExportNotAllowedError";
  }
}

/** Bloque un export frontend si le rôle n'a pas la capacité `canExport`. */
export function assertCanExport(canExport: boolean): asserts canExport is true {
  if (!canExport) {
    throw new ExportNotAllowedError();
  }
}
