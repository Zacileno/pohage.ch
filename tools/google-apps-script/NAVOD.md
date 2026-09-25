# Rezervace zpětného hovoru PoHaGe → Google Sheet + e-mail

Stránka `pohage.ch/termin` (a jazykové verze) pošle jméno, telefon, e-mail, jazyk
a 3 vybrané termíny do Google Sheetu, záložka **Termíny**. Stejná logika jako
u Optivia:

- Web zapíše řádek **hned**.
- **Každých 15 minut** skript zkontroluje nové řádky. Pokud nějaké jsou, pošle na
  `info@pohage.ch` e-mail s údaji a tlačítky **✓ Zavoláno** a **Otevřít tabulku**.
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
Vznikne záložka **Termíny** a nastaví se oba časovače (15 min + pondělí).
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
