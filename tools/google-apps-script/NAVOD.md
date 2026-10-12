# Formuláře PoHaGe → Google Sheet + e-mail

Sheet „rezervace termínů pohage.ch“ (účet Zacíleno), dva listy:

- **Schůzka**: stránka `pohage.ch/termin` (a jazykové verze) pošle jméno, telefon,
  e-mail, jazyk a 3 vybrané termíny. Tlačítko v e-mailu: **✓ Zavoláno**.
- **Formulář**: kontaktní formulář na úvodní stránce a na `/kontakt` pošle jméno,
  telefon, e-mail, zájem, zprávu a jazyk. Tlačítko v e-mailu: **✓ Vyřízeno**.

E-maily chodí na adresy v `NOTIFY_EMAILS` (info@pohage.ch a michaela@zacileno.cz).
Při testech dej do `NOTIFY_EMAILS` jen michaela@zacileno.cz, ať se info@pohage.ch nezahltí.

Kalendář: první volný den je `FIRST_DAY` (skript i `js/main.js`), konec je 31. 12.
letošního roku, od 1. července 31. 12. příštího roku. Obojí musí sedět ve skriptu i na webu.

Stejná logika jako u Optivia:

- Web zapíše řádek **hned**.
- **Každých 15 minut** skript zkontroluje nové řádky. Pokud nějaké jsou, pošle na
  `NOTIFY_EMAILS` e-mail s údaji a tlačítky **✓ Zavoláno / ✓ Vyřízeno** a **Otevřít tabulku**.
  Když nic nového nepřišlo, nedělá nic.
- **Každé pondělí v 8:00** přijde počet nevyřízených poptávek (bez „Zavoláno“).
  Chodí i při nule, takže když v pondělí nepřijde, skript nejede.

Skript běží pod účtem Zacíleno, e-maily odchází z něj.

---

## 1. Google Sheet

Na [sheets.google.com](https://sheets.google.com) založ nový sheet, např.
**PoHaGe – Rückruf-Termine**. Záložky neřeš, vytvoří je skript.

## 2. Vlož skript

1. V sheetu **Rozšíření → Apps Script**.
2. Smaž ukázku a vlož celý obsah `booking.gs`. Ulož.
3. Vlevo **Nastavení projektu** (ozubené kolo) → **Časové pásmo: (GMT+01:00) Zurich**.
   Podle něj se řídí pondělní 8:00.

## 3. Spusť `setup`

Nahoře vyber funkci **setup** → **▶ Spustit** → povol oprávnění.
Vzniknou listy **Schůzka** a **Formulář** a nastaví se oba časovače (15 min + pondělí).
Ověřit jde v editoru vlevo pod ikonou hodin **Spouštěče**.

## 4. Nasaď jako webovou aplikaci

1. **Nasadit → Nové nasazení** → typ **Webová aplikace**.
2. **Spustit jako:** Já · **Kdo má přístup:** Kdokoli.
3. **Nasadit** a zkopíruj URL (končí na `/exec`).

## 5. Vlož URL do skriptu

1. Do `WEBAPP_URL` nahoře ve skriptu vlož zkopírovanou URL. Ulož.
2. **Nasadit → Spravovat nasazení → tužka → Verze: Nová → Nasadit.**
   URL zůstává stejná.
3. URL pošli Claudovi, vloží ji do webu (`BOOKING_URL` v `js/main.js`).

---

## Po každé změně skriptu

Ulož → **Spravovat nasazení → tužka → Verze: Nová → Nasadit.**
Spouštěče jedou dál, znovu je nastavovat netřeba.

**Pozor:** bez spuštěného `setup` nejsou časovače a e-maily vůbec neodchází
(data jen leží v tabulce). Kontrola: v editoru vlevo ikona hodin **Spouštěče**,
musí tam být `sendPending` a `weeklyReport`.

## Ruční zkouška bez webu

V editoru můžeš spustit:
- `sendPending` – hned pošle e-maily k novým řádkům,
- `weeklyReport` – hned pošle pondělní kontrolu.

## Tlačítko „Zavoláno“

Odkaz v e-mailu otevře stránku s tlačítkem, teprve to zaškrtne políčko v tabulce.
Některé e-mailové služby odkazy samy otevírají kvůli kontrole bezpečnosti, tak aby
se řádek neodškrtl sám. Zaškrtnout jde i ručně přímo v tabulce, řádek pak zešedne.

## Limity

E-maily: 100 denně u běžného Google účtu, 1 500 u Google Workspace. Řádků prakticky neomezeně.
