'use strict';

const AREAS = {
  mobil: 'Mobile Aufbereitung',
  halle: 'Aufbereitung in Halle / Werkstatt',
  lack: 'Lackschäden & Smart Repair',
};

const SERVICES = {
  innen: 'Innenreinigung',
  innen_intensiv: 'Intensive Innenraumreinigung',
  polster: 'Polsterreinigung',
  leder: 'Lederpflege',
  tierhaar: 'Tierhaarentfernung',
  aussen: 'Außenreinigung',
  politur: 'Politur und Lackaufbereitung',
  versiegelung: 'Versiegelung',
  komplett: 'Komplettaufbereitung',
  leasing: 'Leasingrückgabe-Aufbereitung',
  lack: 'Lackschäden und Smart Repair',
};

// Ausführungsort getrennt von der Leistung
const LOCATIONS = { mobil: 'Mobil beim Kunden', betrieb: 'Beim Betrieb', beides: 'Beides möglich' };

const VEHICLE_TYPES = {
  kleinwagen: 'Kleinwagen', kompakt: 'Kompaktklasse', limousine: 'Limousine / Mittelklasse', kombi: 'Kombi',
  suv: 'SUV / Geländewagen', van: 'Van / Bus', transporter: 'Transporter', sportwagen: 'Sportwagen / Coupé',
  wohnmobil: 'Wohnmobil', sonstiges: 'Sonstiges',
};

const TIMEFRAMES = {
  asap: 'So bald wie möglich', woche: 'Innerhalb einer Woche', zwei_wochen: 'In den nächsten 2 Wochen',
  monat: 'Innerhalb eines Monats', flexibel: 'Flexibel', termin: 'Wunschtermin (siehe Beschreibung)',
};

const DAMAGE_TYPES = { kratzer: 'Kratzer', abplatzer: 'Lackabplatzer', parkschaden: 'Parkschaden', sonstiges: 'Sonstiges', unsicher: 'Ich bin mir nicht sicher' };
const DAMAGE_SIZES = { klein: 'Bis ca. 2 cm', mittel: 'Ca. 2–10 cm', gross: 'Ca. 10–30 cm', sehr_gross: 'Größer als 30 cm', unsicher: 'Ich bin mir nicht sicher' };
const PARTS = {
  stossfaenger_vorne: 'Stoßfänger vorne', stossfaenger_hinten: 'Stoßfänger hinten', motorhaube: 'Motorhaube',
  kotfluegel: 'Kotflügel', tuer: 'Tür', seitenwand: 'Seitenwand', dach: 'Dach', heckklappe: 'Heckklappe',
  spiegel: 'Außenspiegel', felge: 'Felge', mehrere: 'Mehrere Bauteile', unsicher: 'Ich bin mir nicht sicher',
};
const TRISTATE = { ja: 'Ja', nein: 'Nein', unsicher: 'Weiß nicht' };

const REQUEST_STATUS = {
  offen: 'Anfrage offen',
  angebote: 'Angebote erhalten',
  vergeben: 'Auftrag vergeben',
  in_bearbeitung: 'In Bearbeitung',
  fertig_gemeldet: 'Fertigstellung gemeldet',
  bestaetigt: 'Durchführung und Bezahlung bestätigt',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
  zurueckgezogen: 'Zurückgezogen',
  klaerung: 'In Klärung',
};

const COMMISSION_STATUS = {
  voraussichtlich: 'Voraussichtliche Provision',
  abrechenbar: 'Abrechenbare Provision',
  rechnung_erstellt: 'Rechnung erstellt',
  bezahlt: 'Provision bezahlt',
  klaerung: 'In Klärung',
  storniert: 'Storniert (keine Provision)',
};

module.exports = { AREAS, SERVICES, LOCATIONS, VEHICLE_TYPES, TIMEFRAMES, DAMAGE_TYPES, DAMAGE_SIZES, PARTS, TRISTATE, REQUEST_STATUS, COMMISSION_STATUS };
