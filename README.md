# Moje zgrade

Tim DELTA · Datathon Portala otvorenih podataka · Izazov B — Okoliš i održivi prostor

Interaktivna karta Zagreba povezuje energetske certifikate, solarni potencijal, obnovu i modelirane poplave s adresama i obrisima zgrada. Građani i suvlasnici mogu pregledati podatak za zgradu i otvoriti pripadajući izvor.

## Isprobajte

- [Otvori kartu](https://moje-zgrade-delta.vercel.app/)
- [Paket s videom i uputama](https://github.com/barebucan/dataton-moje-zgrade-demo/releases/tag/datathon-predaja)

Prođite kroz četiri prikaza. U prikazu **Poplave** pretražite **Ivana Lučića 5** i odaberite južnu zgradu Fakulteta strojarstva i brodogradnje. Kartica prikazuje najveću modeliranu dubinu i rezultate za sva tri scenarija.

## Struktura i pokretanje

| Mapa ili datoteka | Namjena |
|---|---|
| [api](api) | Poslužiteljske rute i sažetak poplavnih scenarija |
| [runtime-source](runtime-source) | Python moduli za prostorno povezivanje, slojeve i izvore |
| [overrides](overrides) | Sučelje karte, legenda i kartice zgrada |
| `build.mjs` | Dohvat i provjera paketa s bazama, geometrijom i vektorskim pločicama |
| `vercel.json` | Postavke objave i usmjeravanje zahtjeva |

Python i SQLite povezuju prostorne i tematske zapise. Karta koristi pripremljene vektorske pločice, a pri odabiru zgrade učitava pripadajuće detalje. Za pripremu objave pokrenite `node build.mjs` iz korijena repozitorija. Potrebni su Node.js s ugrađenim `fetch`, `tar` i internetska veza. Skripta provjerava kontrolnu sumu preuzetog paketa prije raspakiravanja.

[Izvori, metode i licence podataka](docs/IZVORI.md) · [Čitanje poplavnog prikaza](FLOOD_OVERVIEW.md) · [Licenca koda](LICENSE.txt)
