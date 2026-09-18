/**
 * Correos de mentira para poder mostrar todo el sistema funcionando sin
 * conectar Outlook. Se activan con DEMO=1.
 *
 * Si además falta ANTHROPIC_API_KEY, se usa el campo `analysis` precocinado,
 * así el panel se ve completo incluso sin llamar a Claude.
 *
 * Ambientados en el día real de Valeria: fábrica ecococo en Indonesia
 * (João en envíos, su jefe el Sr. Wali), sede en Paraguay, y clientes de
 * Líbano, Brasil y Estados Unidos. Los dolores de cabeza de siempre:
 * tablas que no cuadran, precios, gastos y plata que no llega.
 */
import { config } from './config.js';

const YO = config.her.email || 'ella@empresa.com';
const NOMBRE = config.her.name || 'Ella';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const enDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export const DEMO_THREADS = [
  {
    conversationId: 'DEMO-pago-libano',
    messages: [
      {
        from: { name: 'Sr. Wali', email: 'wali@ecococo.co.id' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'El pago de Beirut sigue sin entrar - freno el próximo contenedor',
        receivedAt: hoursAgo(11),
        body: `Valeria,

La factura EC-1187 de Cedar Shisha (Beirut) por USD 38.600 venció hace 8 días y todavía no veo la plata en la cuenta. Karim me dice por WhatsApp que ya transfirió, pero no me manda el comprobante y el banco no muestra nada.

No puedo liberar el próximo contenedor (ya booking confirmado) mientras esta factura siga abierta. Necesito que hables vos con Karim y me consigas el comprobante de transferencia HOY, o me confirmes si de verdad pagó.

Si el lunes no está, cancelo el booking.

Wali`,
      },
    ],
    analysis: {
      titulo: 'La plata de Beirut no entró y frenan el contenedor',
      quien: 'Sr. Wali, jefe de la fábrica ecococo',
      resumen:
        'La factura EC-1187 de Cedar Shisha (Beirut) por USD 38.600 venció hace 8 días y el pago no aparece en la cuenta. El cliente dice que ya transfirió pero no manda comprobante. Wali no libera el próximo contenedor —ya con booking— hasta que se aclare, y avisa que el lunes lo cancela.',
      lo_que_dijeron: [
        'La factura EC-1187 de Cedar Shisha (Beirut) por USD 38.600 venció hace 8 días.',
        'Karim dice que transfirió, pero no manda comprobante y el banco no muestra nada.',
        'Wali no libera el próximo contenedor (ya con booking) hasta cobrar.',
        'Si el lunes no está el pago, se cancela el booking.',
      ],
      te_piden: [
        'Hablar con Karim y conseguir el comprobante de transferencia hoy',
        'Confirmarle a Wali si el cliente realmente pagó',
      ],
      preguntas_abiertas: ['¿Karim ya transfirió de verdad?', '¿Tiene comprobante?'],
      datos_clave: [
        { etiqueta: 'Cliente', valor: 'Cedar Shisha (Beirut)' },
        { etiqueta: 'Factura', valor: 'EC-1187' },
        { etiqueta: 'Monto', valor: 'USD 38.600' },
        { etiqueta: 'Vencida hace', valor: '8 días' },
      ],
      categoria: 'pago',
      urgencia: 'alta',
      motivo_urgencia: 'Si el lunes no entra la plata, se cae el booking del próximo contenedor.',
      fecha_limite: enDias(3),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se cancela el embarque y la relación con el cliente y con Wali se tensa.',
      sentimiento: 'apurado',
      consejo:
        'Pedile a Karim el comprobante con el número de operación, no una promesa: con eso Wali libera el contenedor sin esperar a que el banco lo muestre.',
      respuesta_sugerida:
        'Hi Karim, hope you are well. Our factory is holding the next container until invoice EC-1187 (USD 38,600) is confirmed as paid. Could you please send me the SWIFT/transfer receipt today? With the operation number we can release the shipment right away.',
      una_linea_para_voz:
        'El pago de Cedar Shisha de Beirut no entró y Wali frena el próximo contenedor: necesita que le consigas el comprobante hoy.',
    },
  },
  {
    conversationId: 'DEMO-tablas-envio',
    messages: [
      {
        from: { name: 'João Ribeiro', email: 'joao@ecococo.co.id' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'No me cuadran el packing list y la factura del ECC-4471',
        receivedAt: hoursAgo(6),
        body: `Hola Valeria,

Estoy por cerrar los documentos del contenedor ECC-4471 y las tablas no coinciden:

- Packing list: 1.150 cajas
- Factura comercial: 1.200 cajas
- Diferencia de peso neto: 210 kg entre las dos planillas

El despachante necesita los documentos mañana temprano para emitir el B/L. No puedo mandar así porque en aduana rebota. ¿Cuál es el número bueno, 1.150 o 1.200? ¿Reviso yo la carga o me confirmás vos desde la orden?

Abrazo,
João`,
      },
    ],
    analysis: {
      titulo: 'El packing list y la factura del contenedor no cuadran',
      quien: 'João Ribeiro, encargado de envíos en ecococo',
      resumen:
        'João está por cerrar los documentos del contenedor ECC-4471 y las tablas no coinciden: el packing list dice 1.150 cajas y la factura 1.200, con 210 kg de diferencia de peso neto. El despachante necesita los papeles mañana temprano para el B/L y si no cuadran, aduana los rebota.',
      lo_que_dijeron: [
        'Packing list: 1.150 cajas; factura comercial: 1.200 cajas.',
        'Hay 210 kg de diferencia de peso neto entre las dos planillas.',
        'El despachante necesita los documentos mañana temprano para emitir el B/L.',
        'Si no cuadran, en aduana rebotan.',
      ],
      te_piden: [
        'Definir cuál es el número correcto de cajas (1.150 o 1.200)',
        'Decir si revisa él la carga o confirmás vos desde la orden',
      ],
      preguntas_abiertas: ['¿1.150 o 1.200 cajas?', '¿De dónde salió la diferencia de 210 kg?'],
      datos_clave: [
        { etiqueta: 'Contenedor', valor: 'ECC-4471' },
        { etiqueta: 'Packing list', valor: '1.150 cajas' },
        { etiqueta: 'Factura', valor: '1.200 cajas' },
        { etiqueta: 'Dif. peso', valor: '210 kg' },
      ],
      categoria: 'logistica',
      urgencia: 'alta',
      motivo_urgencia: 'Los documentos van al despachante mañana temprano y sin cuadrar rebotan en aduana.',
      fecha_limite: enDias(1),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se emite un B/L con datos que no cierran y la carga se traba en aduana.',
      sentimiento: 'apurado',
      consejo:
        'Cruzá el número contra la orden de compra antes de decidir: casi siempre la que está mal es la factura, y si emitís el B/L con el dato equivocado después corregirlo es un lío.',
      respuesta_sugerida:
        'João, dame 10 minutos que cruzo las cajas contra la orden ECC-4471 y te confirmo el número bueno. No emitas nada hasta que te pase el dato para que no rebote en aduana.',
      una_linea_para_voz:
        'A João no le cuadran el packing list y la factura del contenedor, y los papeles van mañana al despachante.',
    },
  },
  {
    conversationId: 'DEMO-precios-usa',
    messages: [
      {
        from: { name: 'Mike Sullivan', email: 'mike@lightupcoals.com' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Price increase 8% - we need justification before we sign',
        receivedAt: hoursAgo(28),
        body: `Hi ${NOMBRE},

We received the new price list with an 8% increase across all cube and hexagonal sizes. Before we renew the contract we need to understand why. Our competitor from Indonesia is holding last year's price.

We move 4x40HQ per month, so this is a big jump for us. Two questions:
1) What is driving the 8%? Coconut shell cost?
2) Can we get a volume tier if we commit to 5x40HQ per month?

We like your quality but I need something to show my finance team.

Mike`,
      },
    ],
    analysis: {
      titulo: 'Cliente de USA frena por la suba de precios del 8%',
      quien: 'Mike Sullivan, distribuidor en Estados Unidos',
      resumen:
        'Mike recibió la nueva lista con un 8% de aumento en todos los tamaños de cubo y hexagonal y no firma la renovación hasta entender por qué. Mueve 4x40HQ por mes y su competidor indonesio mantiene el precio del año pasado. Pide justificación (¿costo de la cáscara de coco?) y un precio por volumen si sube a 5x40HQ mensuales.',
      lo_que_dijeron: [
        'Llegó la nueva lista con 8% de aumento en cubo y hexagonal.',
        'El competidor de Indonesia mantiene el precio del año pasado.',
        'Mueven 4x40HQ por mes; es un salto grande para ellos.',
        'Piden justificación del aumento y un escalón por volumen a 5x40HQ.',
      ],
      te_piden: [
        'Explicar qué motiva el aumento del 8%',
        'Ofrecer un precio por volumen si suben a 5x40HQ mensuales',
      ],
      preguntas_abiertas: ['¿Qué justifica la suba?', '¿Hay margen para un descuento por volumen?'],
      datos_clave: [
        { etiqueta: 'Aumento', valor: '8%' },
        { etiqueta: 'Volumen actual', valor: '4 x 40HQ / mes' },
        { etiqueta: 'Ofrecen subir a', valor: '5 x 40HQ / mes' },
        { etiqueta: 'Mercado', valor: 'Estados Unidos' },
      ],
      categoria: 'precios',
      urgencia: 'media',
      motivo_urgencia: 'Es un cliente grande a punto de renovar; si se enfría se va al competidor.',
      fecha_limite: '',
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Pierde un contrato de 48 contenedores al año contra un competidor más barato.',
      sentimiento: 'tranquilo',
      consejo:
        'Dale un motivo concreto (subió la cáscara de coco) y un premio por volumen: si baja a 5% con el compromiso de 5x40HQ, gana el cliente sin regalar margen.',
      respuesta_sugerida:
        'Hi Mike, thanks for the honest note. The 8% comes mostly from the rise in raw coconut shell cost this season plus freight. Here is what I can do: if you commit to 5x40HQ per month, I can bring the increase down to 5% and lock it for 12 months. I will also send the burn-time and ash comparison vs your current supplier for your finance team.',
      una_linea_para_voz:
        'Mike, el cliente grande de Estados Unidos, no firma la renovación hasta que le expliques la suba del 8%.',
    },
  },
  {
    conversationId: 'DEMO-gastos-flete',
    messages: [
      {
        from: { name: 'João Ribeiro', email: 'joao@ecococo.co.id' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Sobrecosto en el flete del último embarque - necesito tu OK',
        receivedAt: hoursAgo(34),
        body: `Valeria,

El forwarder nos facturó USD 1.240 de más sobre el flete que estaba cotizado en el último embarque:

- 3 días de demurrage en el puerto de Surabaya: USD 840
- Aumento de THC (manipuleo en terminal): USD 400

Dicen que la demora fue porque los documentos llegaron tarde. Yo tengo los correos y la carga estuvo lista a tiempo, así que la demora no fue nuestra. ¿Lo pago para no trabar la próxima carga, o lo peleamos con el forwarder? Si lo pago, me come el margen de ese contenedor.

João`,
      },
    ],
    analysis: {
      titulo: 'Sobrecosto de flete que se come el margen',
      quien: 'João Ribeiro, encargado de envíos en ecococo',
      resumen:
        'El forwarder facturó USD 1.240 de más sobre el flete cotizado: USD 840 por 3 días de demurrage en Surabaya y USD 400 por aumento de THC. Dicen que la demora fue por documentos tarde, pero João tiene los correos que muestran que la carga estuvo lista a tiempo. Pregunta si pagar para no trabar la próxima o pelearlo, porque le come el margen del contenedor.',
      lo_que_dijeron: [
        'Sobrecosto total de USD 1.240 sobre el flete cotizado.',
        'USD 840 de demurrage (3 días en Surabaya) y USD 400 de aumento de THC.',
        'El forwarder dice que la demora fue por documentos tarde.',
        'João tiene los correos que prueban que la carga estuvo lista a tiempo.',
      ],
      te_piden: ['Decidir si pagar el sobrecosto o disputarlo con el forwarder'],
      preguntas_abiertas: ['¿La demora fue nuestra o del forwarder?'],
      datos_clave: [
        { etiqueta: 'Sobrecosto', valor: 'USD 1.240' },
        { etiqueta: 'Demurrage', valor: '3 días · USD 840' },
        { etiqueta: 'THC', valor: 'USD 400' },
        { etiqueta: 'Puerto', valor: 'Surabaya' },
      ],
      categoria: 'gastos',
      urgencia: 'media',
      motivo_urgencia: 'Cuanto más se demora el reclamo, más difícil es que el forwarder reconozca la culpa.',
      fecha_limite: '',
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se paga un sobrecosto que no era nuestro y se pierde margen del contenedor.',
      sentimiento: 'tranquilo',
      consejo:
        'Con los correos que tiene João, reclamale al forwarder el demurrage antes de pagar: si la carga estuvo lista a tiempo, ese USD 840 no es tuyo.',
      respuesta_sugerida:
        'João, mandame los correos donde se ve que la carga estuvo lista a tiempo y armamos el reclamo formal al forwarder por los USD 840 de demurrage. El THC lo vemos aparte. No pagues el demurrage hasta que respondan.',
      una_linea_para_voz:
        'El forwarder cobró mil doscientos cuarenta dólares de más por una demora que no fue nuestra, y João necesita que decidas si lo pagás o lo peleás.',
    },
  },
  {
    conversationId: 'DEMO-reclamo-brasil',
    messages: [
      {
        from: { name: 'Bruno Almeida', email: 'bruno@brasacoco.com.br' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Reclamação - briquetes hexagonais chegaram quebrados',
        receivedAt: hoursAgo(16),
        body: `Oi ${NOMBRE},

Recebemos o último embarque e tivemos um problema: cerca de 15% dos briquetes hexagonais chegaram quebrados ou virados pó. As caixas do fundo do pallet foram as mais afetadas.

Estou enviando fotos por WhatsApp. Isso é um lote grande para nós e o cliente final já reclamou. Preciso de uma solução: nota de crédito ou reposição no próximo embarque.

Podemos falar hoje?

Bruno`,
      },
    ],
    analysis: {
      titulo: 'Reclamo de Brasil: briquetas hexagonales rotas',
      quien: 'Bruno Almeida, cliente en Brasil',
      resumen:
        'Bruno recibió el último embarque con cerca del 15% de las briquetas hexagonales rotas o hechas polvo, sobre todo en las cajas del fondo del pallet. Ya le reclamó el cliente final. Manda fotos por WhatsApp y pide una solución: nota de crédito o reposición en el próximo embarque. Quiere hablar hoy.',
      lo_que_dijeron: [
        'Cerca del 15% de las briquetas hexagonales llegaron rotas o hechas polvo.',
        'Las cajas más afectadas fueron las del fondo del pallet.',
        'El cliente final de Bruno ya reclamó.',
        'Pide nota de crédito o reposición en el próximo embarque.',
      ],
      te_piden: ['Dar una solución: nota de crédito o reposición', 'Estar disponible para hablar hoy'],
      preguntas_abiertas: ['¿De qué lote es?', '¿Fue tema de estiba o de producción?'],
      datos_clave: [
        { etiqueta: 'Roto', valor: '~15%' },
        { etiqueta: 'Formato', valor: 'Hexagonal' },
        { etiqueta: 'Zona', valor: 'Cajas del fondo del pallet' },
        { etiqueta: 'Cliente', valor: 'Brasil' },
      ],
      categoria: 'calidad',
      urgencia: 'alta',
      motivo_urgencia: 'Es un cliente grande, ya le reclamó su propio cliente y quiere respuesta hoy.',
      fecha_limite: enDias(1),
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'Se pierde un cliente grande y se dañó la marca frente a su cliente final.',
      sentimiento: 'apurado',
      consejo:
        'Pedile las fotos y el número de lote antes de prometer nada: si fue estiba, lo cubrís rápido; si fue producción, lo hablás con João y Wali con el dato en la mano.',
      respuesta_sugerida:
        'Oi Bruno, lamento o problema. Me manda as fotos e o número do lote das caixas afetadas? Com isso avalio hoje mesmo com a fábrica se foi estiva ou produção e te confirmo a solução (nota de crédito ou reposição). Posso te ligar às 15h.',
      una_linea_para_voz:
        'Bruno, de Brasil, reclama que el 15% de las briquetas hexagonales llegaron rotas y quiere una solución hoy.',
    },
  },
  {
    conversationId: 'DEMO-conciliacion',
    messages: [
      {
        from: { name: 'Sr. Wali', email: 'wali@ecococo.co.id' },
        to: [{ name: NOMBRE, email: YO }],
        subject: 'Conciliación de septiembre - los números no cierran',
        receivedAt: hoursAgo(31),
        body: `Valeria,

Necesito la conciliación de septiembre para el directorio del viernes. Cuando cruzo las tres tablas —ventas facturadas, pagos recibidos y gastos de embarque— me quedan unos USD 6.000 sin explicar. Puede ser algún flete que cargamos doble o un pago parcial de un cliente que no anotamos.

¿Podés revisar y dejarlo cerrado antes del viernes? Prefiero llegar al directorio con los números cuadrados y no con un agujero.

Gracias,
Wali`,
      },
    ],
    analysis: {
      titulo: 'Conciliación de septiembre con USD 6.000 sin explicar',
      quien: 'Sr. Wali, jefe de la fábrica ecococo',
      resumen:
        'Wali necesita la conciliación de septiembre para el directorio del viernes. Al cruzar ventas facturadas, pagos recibidos y gastos de embarque le quedan unos USD 6.000 sin explicar —quizás un flete cargado doble o un pago parcial no anotado— y quiere llegar con los números cuadrados.',
      lo_que_dijeron: [
        'La conciliación de septiembre va al directorio del viernes.',
        'Al cruzar ventas, pagos recibidos y gastos de embarque quedan USD 6.000 sin explicar.',
        'Puede ser un flete cargado doble o un pago parcial de un cliente sin anotar.',
      ],
      te_piden: ['Revisar y dejar cerrada la conciliación antes del viernes'],
      preguntas_abiertas: ['¿De dónde salen los USD 6.000?'],
      datos_clave: [
        { etiqueta: 'Diferencia', valor: 'USD 6.000' },
        { etiqueta: 'Entrega', valor: 'Viernes (directorio)' },
        { etiqueta: 'Tablas', valor: 'Ventas · pagos · gastos' },
      ],
      categoria: 'interno',
      urgencia: 'media',
      motivo_urgencia: 'Va al directorio el viernes y hoy los números no cierran.',
      fecha_limite: '',
      bola_en_su_cancha: true,
      riesgo_si_no_responde: 'El directorio ve un agujero de USD 6.000 sin explicar.',
      sentimiento: 'tranquilo',
      consejo:
        'Empezá por los fletes con sobrecosto (como el de Surabaya): las diferencias de conciliación casi siempre salen de un gasto cargado dos veces o de un pago parcial que no se anotó.',
      respuesta_sugerida:
        'Wali, me pongo con la conciliación hoy. Voy a cruzar primero los fletes con sobrecosto y los pagos parciales de clientes, que suele ser de ahí. Te lo dejo cerrado el jueves para que llegues tranquilo al directorio.',
      una_linea_para_voz:
        'Wali necesita la conciliación de septiembre para el viernes y le quedan seis mil dólares sin explicar.',
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
