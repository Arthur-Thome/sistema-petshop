/*
 * Gera um payload Pix no padrão EMV/BR Code.
 *
 * O payload gerado pode ser usado tanto como
 * Pix Copia e Cola quanto para criação do QR Code.
 */


function formatarCampo(id, valor) {
  const texto = String(valor);

  const tamanho =
    String(
      Buffer.byteLength(
        texto,
        "utf8"
      )
    ).padStart(2, "0");

  return `${id}${tamanho}${texto}`;
}


/*
 * Remove caracteres que podem causar problemas
 * de compatibilidade no nome e cidade apresentados
 * pelo Pix.
 */
function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^A-Za-z0-9 ]/g,
      ""
    )
    .toUpperCase()
    .trim();
}


/*
 * CRC16-CCITT utilizado pelo padrão EMV.
 */
function calcularCRC16(payload) {
  let crc = 0xffff;

  for (
    let i = 0;
    i < payload.length;
    i++
  ) {
    crc ^=
      payload.charCodeAt(i) << 8;

    for (
      let bit = 0;
      bit < 8;
      bit++
    ) {
      if (crc & 0x8000) {
        crc =
          (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
}


function gerarPayloadPix({
  chave,
  nome,
  cidade,
  valor,
  txid,
}) {
  if (!chave) {
    throw new Error(
      "Chave Pix não configurada."
    );
  }


  const nomeFormatado =
    normalizarTexto(nome)
      .slice(0, 25);

  const cidadeFormatada =
    normalizarTexto(cidade)
      .slice(0, 15);


  /*
   * Merchant Account Information do Pix.
   *
   * GUI oficial:
   * BR.GOV.BCB.PIX
   */
  const contaPix =
    formatarCampo(
      "00",
      "BR.GOV.BCB.PIX"
    ) +
    formatarCampo(
      "01",
      chave
    );


  /*
   * O TXID identifica a cobrança.
   *
   * Nesta primeira versão usamos um identificador
   * baseado no atendimento.
   */
  const txidFormatado =
    String(txid || "***")
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      )
      .slice(0, 25) ||
    "***";


  const dadosAdicionais =
    formatarCampo(
      "05",
      txidFormatado
    );


  let payload = "";

  // Payload Format Indicator
  payload +=
    formatarCampo(
      "00",
      "01"
    );

  // Merchant Account Information
  payload +=
    formatarCampo(
      "26",
      contaPix
    );

  // Merchant Category Code
  payload +=
    formatarCampo(
      "52",
      "0000"
    );

  // Moeda: Real brasileiro
  payload +=
    formatarCampo(
      "53",
      "986"
    );


  /*
   * O valor fica gravado no próprio QR Code.
   */
  if (
    valor !== null &&
    valor !== undefined
  ) {
    payload +=
      formatarCampo(
        "54",
        Number(valor).toFixed(2)
      );
  }


  // País
  payload +=
    formatarCampo(
      "58",
      "BR"
    );

  // Nome do recebedor
  payload +=
    formatarCampo(
      "59",
      nomeFormatado
    );

  // Cidade do recebedor
  payload +=
    formatarCampo(
      "60",
      cidadeFormatada
    );

  // Dados adicionais / TXID
  payload +=
    formatarCampo(
      "62",
      dadosAdicionais
    );


  /*
   * Campo CRC.
   * Primeiro acrescentamos "6304" e depois
   * calculamos o checksum do payload completo.
   */
  payload += "6304";

  const crc =
    calcularCRC16(payload);

  return payload + crc;
}


module.exports = {
  gerarPayloadPix,
};