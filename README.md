# Moje zgrade — konačna javna verzija v214

https://moje-zgrade-delta.vercel.app/

Brži 3D prikaz temeljen na provjerenoj v212, uz sačuvan javni poplavni pregled svih triju scenarija. Četiri sloja: energetski certifikati, solarni potencijal, obnova i poplave. Interaktivni izbor zgrade i izvori iza detalja.

Zagreb: 129.365 kanonskih obrisa, 7.898 projektnih i događajnih zapisa obnove (nisu jedinstvene obnovljene zgrade). Uključene su neovisno pregledane ispravke deset statusa obnove iz v212. Podaci o poplavama ostaju tri postojeća modelirana scenarija.

## Ponovljiva objava

build.mjs preuzima https://github.com/barebucan/dataton-moje-zgrade-demo/releases/download/final-v214-20261108/moje-zgrade-runtime-final-v214.tar.gz i provjerava SHA256 d9c9ab5711d961e00ca860cc3deb4eec30ba22fd28d1112b6f2a1533d0928a9f. Runtime sadrži baze, geometriju, 3.172 vektorske pločice, web i Python kod. runtime-source i overrides sadrže čitljive kodove ove verzije; potpuni izvor je i u runtime arhivi. api/flood_overview.py izvodi pregled scenarija. Baze su read-only/immutable, nova obrada preko javne aplikacije isključena. Vercel objava nema vezu s Bartolom niti traži API tajne.

Poplavni pregled je zadan i u vektorskoj karti i u detalju. Sva tri izvorna rezultata ostaju dostupna, kao i pojedinačni scenariji. 3D je jedini ponuđeni način prikaza. Privremeni prekid pločica koristi automatski ponovni pokušaj, pomoćni prikaz i povratak u brži prikaz.

Izvori, vremenski presjeci, licence i ograničenja pojedinog podatka dostupni su kroz aplikaciju i dokumentaciju predaje. Razred stana ne postaje razred cijele zgrade; planirana obnova ne postaje izvedena; solarna procjena nije potvrda izvedivosti.
