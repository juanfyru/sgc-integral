/** «1 copia», «3 copias»: la cantidad con el sustantivo en singular o en plural. */
export function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
