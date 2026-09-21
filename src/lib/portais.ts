/**
 * Endereço de cada portal a partir de onde o app está rodando.
 *
 * `BASE_URL` (o `base` do Vite, injetado por `VITE_BASE` no CI) já termina
 * em barra. Em produção é `/`; no github.io é `/sistema/`. Escrever o
 * caminho na mão quebraria justamente no ambiente que não é o de produção.
 *
 * Ficam aqui, e não dentro de cada tela, porque três lugares diferentes
 * precisam apontar para o portal do aluno — e um endereço desses errado é
 * um link quebrado na mão da aluna, não um erro de compilação.
 */
export const URL_PORTAL_ALUNO = `${import.meta.env.BASE_URL}agendamentos/`
export const URL_PORTAL_PROFESSORA = `${import.meta.env.BASE_URL}portalequipe/`
