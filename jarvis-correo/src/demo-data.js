/**
 * Correos de mentira para poder mostrar todo el sistema funcionando sin
 * conectar Outlook. Se activan con DEMO=1.
 *
 * Si además falta ANTHROPIC_API_KEY, se usa el campo `analysis` precocinado,
 * así el panel se ve completo incluso sin llamar a Claude.
 */
import { config } from './config.js';

const YO = config.her.email || 'ella@empresa.com';
const NOMBRE = config.her.name || 'Ella';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

export const DEMO_THREADS = [
  {
    conversationId: 'DEMO-embarque-4412',
    messages: [
      {
        from: { name: 'Rodrigo Benítez', email: 'rbenitez@sede.com.py' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'URGENTE - Booking contenedor MSKU7741203 se cae mañana',
        receivedAt: hoursAgo(9),
        body: `Hola, buenas.

La naviera nos avisó que el booking del MSKU7741203 vence mañana 18:00 hora Paraguay. Si no confirmamos hoy el packing list definitivo, perdemos el espacio y el próximo vessel sale recién en 12 días.

Necesito de tu lado:
1) Packing list final con el peso neto real por pallet
2) Confirmación de que los 18 pallets de cubo 26mm están terminados
3) El certificado de fumigación

El cliente de Dubai ya pagó el 30% de anticipo y está preguntando por el ETD. No podemos perder este barco.

Avisame apenas puedas.
Rodrigo`,
      },
      {
        from: { name: 'Rodrigo Benítez', email: 'rbenitez@sede.com.py' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'RE: URGENTE - Booking contenedor MSKU7741203 se cae mañana',
        receivedAt: hoursAgo(3),
        body: `Perdón que insista. ¿Llegaste a ver el mail? Con el packing list solo me alcanza, lo demás lo puedo empujar yo desde acá.`,
      },
    ],
    analysis: {
      titulo: 'Booking del contenedor vence mañana',
      quien: 'Rodrigo Benítez, de la sede en Paraguay',
      resumen:
        'La naviera da de baja el booking del MSKU7741203 mañana a las 18:00 de Paraguay si no se confirma el packing list definitivo. Rodrigo ya escribió dos veces y todavía no tuvo respuesta. Si se cae, el próximo barco sale en 12 días y hay un cliente de Dubai con el 30% pagado.',
      lo_que_dijeron: [
        'El booking del contenedor MSKU7741203 vence mañana 18:00 hora Paraguay.',
        'Si se pierde el espacio, el próximo vessel sale recién en 12 días.',
        'El cliente de Dubai ya pagó el 30% de anticipo y pregunta por el ETD.',
        'Con el packing list solo ya le alcanza: el resto lo empuja él desde la sede.',
      ],
      te_piden: [
        'Mandar el packing list final con peso neto real por pallet',
        'Confirmar que los 18 pallets de cubo 26mm están terminados',
        'Mandar el certificado de fumigación',
      ],
      preguntas_abiertas: ['¿Están terminados los 18 pallets de 26mm?'],
      datos_clave: [
        { etiqueta: 'Contenedor', valor: 'MSKU7741203' },
        { etiqueta: 'Vence', valor: 'mañana 18:00 hora Paraguay' },
        { etiqueta: 'Pallets', valor: '18 de cubo 26mm' },
        { etiqueta: 'Anticipo cobrado', valor: '30%' },
      ],
      categoria: 'logistica',
      urgencia: 'alta',
      motivo_urgencia: 'Vence mañana y hay plata de un cliente ya cobrada.',
      fecha_limite: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se pierde el contenedor y el embarque se atrasa 12 días con anticipo ya cobrado.',
      sentimiento: 'apurado',
      respuesta_sugerida:
        'Rodrigo, perdón la demora. Te mando el packing list en la próxima hora con el peso neto por pallet. Los 18 pallets de 26mm están [CONFIRMAR SI TERMINADOS]. El certificado de fumigación lo pido hoy a la planta y te lo reenvío apenas lo tenga.',
      una_linea_para_voz:
        'Rodrigo te está esperando el packing list del contenedor: si no sale hoy, se cae el booking.',
    },
  },
  {
    conversationId: 'DEMO-qc-humedad',
    messages: [
      {
        from: { name: 'Ahmad Fauzi', email: 'ahmad@pt-kelapa-jaya.co.id' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Moisture test result batch KJ-0918',
        receivedAt: hoursAgo(20),
        body: `Dear ${NOMBRE},

Result of moisture test for batch KJ-0918 as below:

Moisture: 6.8%
Ash content: 2.4%
Burning time: 118 minutes
Density: 1.02 g/cm3

Moisture slightly above our normal 5%, because rain season last week. We can re-dry the batch, need 2 more days. Or we send as is, still under 8% limit in contract.

Please advise which one you prefer. If re-dry, production of next batch will delay.

Best regards,
Ahmad`,
      },
    ],
    analysis: {
      titulo: 'Humedad alta en el lote KJ-0918',
      quien: 'Ahmad Fauzi, de la fábrica PT Kelapa Jaya',
      resumen:
        'El lote KJ-0918 dio 6,8% de humedad por las lluvias, por encima del 5% habitual pero todavía debajo del límite de 8% del contrato. Ahmad ofrece dos caminos: re-secar el lote, que suma 2 días y atrasa el siguiente, o embarcarlo como está. Espera que ella elija.',
      lo_que_dijeron: [
        'Humedad 6,8%, ceniza 2,4%, tiempo de quemado 118 minutos, densidad 1,02 g/cm3.',
        'La humedad subió por la temporada de lluvias de la semana pasada.',
        'Sigue por debajo del límite de 8% que fija el contrato.',
        'Re-secar toma 2 días más y atrasa la producción del lote siguiente.',
      ],
      te_piden: ['Decidir si re-secan el lote o lo mandan como está'],
      preguntas_abiertas: ['¿Re-secamos o embarcamos así?'],
      datos_clave: [
        { etiqueta: 'Lote', valor: 'KJ-0918' },
        { etiqueta: 'Humedad', valor: '6.8%' },
        { etiqueta: 'Ceniza', valor: '2.4%' },
        { etiqueta: 'Quemado', valor: '118 min' },
        { etiqueta: 'Límite contractual', valor: '8%' },
      ],
      categoria: 'calidad',
      urgencia: 'media',
      motivo_urgencia: 'La fábrica frena hasta que ella decida, pero no vence hoy.',
      fecha_limite: '',
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'La planta queda parada esperando la decisión y se atrasa el lote siguiente.',
      sentimiento: 'tranquilo',
      respuesta_sugerida:
        'Hi Ahmad, thanks for the numbers. Since 6.8% is still within the 8% contract limit, please send batch KJ-0918 as is and keep the next batch on schedule. Let us flag the moisture level to the customer so there is no surprise.',
      una_linea_para_voz:
        'Ahmad necesita que decidas si re-secan el lote KJ-cero-nueve-dieciocho o lo mandan así.',
    },
  },
  {
    conversationId: 'DEMO-cotizacion-turquia',
    messages: [
      {
        from: { name: 'Mehmet Yilmaz', email: 'mehmet@anadoluhookah.com.tr' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Quotation request - 2x40HQ coconut charcoal',
        receivedAt: hoursAgo(50),
        body: `Hello,

We are a hookah distributor in Istanbul. We need quotation for:
- 2 x 40HQ container
- Cube 25mm, 1kg box
- Monthly, 12 months contract

Please send FOB Surabaya and CIF Mersin price. Also MOQ and payment terms.

We currently buy from another supplier but quality is not stable.

Mehmet`,
      },
      {
        from: { name: NOMBRE, email: YO },
        to: [{ name: 'Mehmet Yilmaz', email: 'mehmet@anadoluhookah.com.tr' }],
        subject: 'RE: Quotation request - 2x40HQ coconut charcoal',
        receivedAt: hoursAgo(46),
        body: `Hi Mehmet, thanks for reaching out. I am checking prices with our head office in Paraguay and will come back to you within 48 hours with a full quotation.`,
      },
    ],
    analysis: {
      titulo: 'Cotización para distribuidor de Estambul',
      quien: 'Mehmet Yilmaz, distribuidor de narguile en Turquía',
      resumen:
        'Mehmet pide cotización por 2x40HQ mensuales durante 12 meses, cubo 25mm en caja de 1kg, con precio FOB Surabaya y CIF Mersin. Ella prometió responder en 48 horas y ya pasaron 46. Viene de otro proveedor con calidad inestable, así que es una oportunidad real.',
      lo_que_dijeron: [
        'Quieren 2 contenedores 40HQ por mes, contrato a 12 meses.',
        'Producto: cubo de 25mm en caja de 1 kg.',
        'Piden precio FOB Surabaya y CIF Mersin, más MOQ y condiciones de pago.',
        'Hoy compran a otro proveedor pero la calidad no les es estable.',
      ],
      te_piden: ['Enviar la cotización completa con FOB y CIF, MOQ y términos de pago'],
      preguntas_abiertas: ['¿Cuál es el precio FOB Surabaya?', '¿Cuál es el CIF Mersin?', '¿MOQ y términos de pago?'],
      datos_clave: [
        { etiqueta: 'Volumen', valor: '2 x 40HQ mensual' },
        { etiqueta: 'Contrato', valor: '12 meses' },
        { etiqueta: 'Producto', valor: 'Cubo 25mm, caja 1kg' },
        { etiqueta: 'Destino', valor: 'Mersin, Turquía' },
      ],
      categoria: 'cotizacion',
      urgencia: 'alta',
      motivo_urgencia: 'Ella prometió responder en 48 horas y el plazo se cumple en 2 horas.',
      fecha_limite: new Date().toISOString().slice(0, 10),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Queda mal en el primer contacto y se pierde un contrato anual de 24 contenedores.',
      sentimiento: 'tranquilo',
      respuesta_sugerida:
        'Hi Mehmet, as promised, here is our quotation: [FOB SURABAYA USD/TON], [CIF MERSIN USD/TON], MOQ 1x40HQ, payment 30% T/T advance and 70% against B/L copy. Prices valid for 15 days. Happy to send a free sample box so you can compare stability against your current supplier.',
      una_linea_para_voz:
        'Le prometiste una cotización a Mehmet de Turquía en cuarenta y ocho horas y el plazo se cumple hoy.',
    },
  },
  {
    conversationId: 'DEMO-pago-factura',
    messages: [
      {
        from: { name: 'Claudia Ferreira', email: 'administracion@sede.com.py' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Factura INV-2291 de PT Kelapa Jaya - falta tu OK',
        receivedAt: hoursAgo(74),
        body: `Hola, cómo va.

Me llegó la factura INV-2291 de PT Kelapa Jaya por USD 41.850 correspondiente al lote de septiembre. Antes de pagar necesito que confirmes que la mercadería entró conforme y que el precio unitario coincide con lo acordado (USD 1.395 por tonelada).

Tenemos 5 días de plazo antes de que empiecen a correr intereses.

Gracias!
Claudia`,
      },
    ],
    analysis: {
      titulo: 'Falta su OK para pagar la factura INV-2291',
      quien: 'Claudia Ferreira, administración de la sede',
      resumen:
        'Administración tiene lista la factura INV-2291 de PT Kelapa Jaya por USD 41.850 y no la paga hasta que ella confirme que la mercadería entró conforme y que el precio unitario es el acordado. Quedan menos de 2 días del plazo de 5 antes de que corran intereses.',
      lo_que_dijeron: [
        'Factura INV-2291 de PT Kelapa Jaya por USD 41.850, lote de septiembre.',
        'El precio unitario a validar es USD 1.395 por tonelada.',
        'Hay 5 días de plazo antes de que empiecen a correr intereses.',
      ],
      te_piden: [
        'Confirmar que la mercadería entró conforme',
        'Validar que el precio unitario coincide con lo acordado',
      ],
      preguntas_abiertas: ['¿La mercadería entró conforme?', '¿El precio de USD 1.395/ton es el correcto?'],
      datos_clave: [
        { etiqueta: 'Factura', valor: 'INV-2291' },
        { etiqueta: 'Monto', valor: 'USD 41.850' },
        { etiqueta: 'Precio unitario', valor: 'USD 1.395 / tonelada' },
        { etiqueta: 'Proveedor', valor: 'PT Kelapa Jaya' },
      ],
      categoria: 'pago',
      urgencia: 'alta',
      motivo_urgencia: 'El plazo de 5 días vence en menos de 2 y después corren intereses.',
      fecha_limite: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se pagan intereses sobre USD 41.850 y se enfría la relación con la fábrica.',
      sentimiento: 'tranquilo',
      respuesta_sugerida:
        'Claudia, confirmo que la mercadería del lote de septiembre entró conforme y que el precio de USD 1.395 por tonelada es el acordado. Podés dar curso al pago de la INV-2291.',
      una_linea_para_voz: 'Administración no puede pagar la factura de la fábrica hasta que le des el OK, y vence en dos días.',
    },
  },
  {
    conversationId: 'DEMO-muestras-alemania',
    messages: [
      {
        from: { name: NOMBRE, email: YO },
        to: [{ name: 'Lena Hoffmann', email: 'l.hoffmann@shishaimport.de' }],
        subject: 'Samples sent - tracking DHL 8842190377',
        receivedAt: hoursAgo(190),
        body: `Hi Lena, the sample box (cube 26mm and flat 22mm) was shipped today. DHL tracking 8842190377. Let me know your feedback once you test them.`,
      },
    ],
    analysis: {
      titulo: 'Muestras a Alemania sin respuesta hace 8 días',
      quien: 'Lena Hoffmann, importadora en Alemania',
      resumen:
        'Ella mandó la caja de muestras de cubo 26mm y flat 22mm hace 8 días con tracking DHL y todavía no recibió ninguna devolución. La pelota está del lado de Lena, pero conviene empujar antes de que se enfríe.',
      lo_que_dijeron: ['Se enviaron muestras de cubo 26mm y flat 22mm.', 'Tracking DHL 8842190377.'],
      te_piden: [],
      preguntas_abiertas: [],
      datos_clave: [
        { etiqueta: 'Tracking', valor: 'DHL 8842190377' },
        { etiqueta: 'Muestras', valor: 'Cubo 26mm y flat 22mm' },
      ],
      categoria: 'muestra',
      urgencia: 'baja',
      motivo_urgencia: 'No hay plazo, pero ya pasaron 8 días sin devolución.',
      fecha_limite: '',
      bola_en_su_cancha: false,
      riesgo_si_no_responde: 'La oportunidad se enfría si nadie vuelve a tocar el tema.',
      sentimiento: 'tranquilo',
      respuesta_sugerida:
        'Hi Lena, just following up on the sample box (DHL 8842190377) — did it arrive well? Curious to hear how the 26mm cube performed in your burn test.',
      una_linea_para_voz: 'Lena, de Alemania, todavía no te dijo nada de las muestras que mandaste hace ocho días.',
    },
  },
  {
    conversationId: 'DEMO-interno-reporte',
    messages: [
      {
        from: { name: 'Rodrigo Benítez', email: 'rbenitez@sede.com.py' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Reporte mensual de producción - recordatorio',
        receivedAt: hoursAgo(30),
        body: `Che, no te olvides del reporte de producción del mes que va a directorio. Lo necesito el viernes a más tardar. Con las toneladas producidas por tipo de cubo y el rechazo de calidad alcanza.`,
      },
    ],
    analysis: {
      titulo: 'Reporte mensual de producción para el viernes',
      quien: 'Rodrigo Benítez, de la sede en Paraguay',
      resumen:
        'Rodrigo le recuerda el reporte mensual de producción que va a directorio. Lo necesita el viernes con toneladas producidas por tipo de cubo y el porcentaje de rechazo de calidad. No es urgente hoy pero tiene fecha fija.',
      lo_que_dijeron: [
        'El reporte va a directorio.',
        'Se necesita el viernes a más tardar.',
        'Alcanza con toneladas por tipo de cubo y el rechazo de calidad.',
      ],
      te_piden: ['Mandar el reporte mensual de producción antes del viernes'],
      preguntas_abiertas: [],
      datos_clave: [{ etiqueta: 'Entrega', valor: 'Viernes' }],
      categoria: 'interno',
      urgencia: 'media',
      motivo_urgencia: 'Tiene fecha fija y lo ve el directorio.',
      fecha_limite: '',
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'El directorio se queda sin el número del mes.',
      sentimiento: 'tranquilo',
      respuesta_sugerida: 'Dale Rodrigo, el viernes lo tenés. Va con toneladas por tipo de cubo y el rechazo de calidad.',
      una_linea_para_voz: 'Rodrigo te recuerda el reporte de producción para el viernes.',
    },
  },
];

export function demoMessages() {
  const out = [];
  for (const t of DEMO_THREADS) {
    t.messages.forEach((m, i) => {
      const esDeElla = m.from.email === YO;
      out.push({
        id: `${t.conversationId}-${i}`,
        conversationId: t.conversationId,
        folder: esDeElla ? 'sent' : 'inbox',
        subject: m.subject || t.messages[0].subject,
        fromName: m.from.name,
        fromEmail: m.from.email,
        to: m.to,
        cc: [],
        receivedAt: m.receivedAt,
        preview: m.body.slice(0, 200),
        body: m.body,
        isRead: false,
        hasAttachments: false,
        attachments: [],
        webLink: '',
      });
    });
  }
  return out;
}

export function demoAnalysisFor(conversationId) {
  return DEMO_THREADS.find((t) => t.conversationId === conversationId)?.analysis ?? null;
}
