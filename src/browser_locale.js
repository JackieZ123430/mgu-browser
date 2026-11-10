'use strict';
// Language comes from the same CurrentVehicleUnits object the BMW SDK uses.
const zhCN=require('./browser_zh_cn');
const en={
 'Anmeldeeingabe ist zu lang':'The sign-in entry is too long',
 'Dialogantwort ist zu lang (maximal 4096 Byte)':'The dialog answer is too long (maximum 4096 bytes)',
 'HTTP- oder HTTPS-Adresse erforderlich':'An HTTP or HTTPS address is required',
 'Bitte eine gueltige HTTPS-Adresse eingeben':'Enter a valid HTTPS address','Zuerst ein Textfeld auf der Webseite auswaehlen':'Select a text field on the page first','Startseitenadresse pruefen':'Check the home page address','Startseite gespeichert':'Home page saved','Start ohne feste Seite':'Start without a home page','Browser geschlossen':'Browser closed',
 'Zurueck':'Back','Vorwaerts':'Forward','Startseite':'Home','Neu laden':'Reload','Laden abbrechen':'Stop loading','Lesezeichen':'Bookmarks','Verlauf und Lesezeichen':'History and bookmarks','Tastatur':'Keyboard','Einstellungen':'Settings','Lesemodus':'Reading mode','Browser schliessen':'Close browser','Adresse oder Suchbegriff':'Address or search','Adresse bearbeiten':'Edit address','Lesezeichen gespeichert':'Bookmark saved','Lesezeichen entfernt':'Bookmark removed','Neuer Tab':'New tab','Deine Seiten':'Your pages','Dein Web. Direkt im iDrive.':'Your web. Directly in iDrive.','Haeufig besucht':'Frequently visited','Verlauf':'History','Noch keine Lesezeichen':'No bookmarks yet','Dein Verlauf beginnt mit der ersten Seite':'Your history starts with your first page','Hier erscheinen deine haeufig besuchten Seiten':'Your frequently visited pages appear here','Waehle oben die Adressleiste. Drehen waehlt, Druecken bestaetigt.':'Select the address bar above. Turn to select, press to confirm.','SCHNELLZUGRIFF':'QUICK ACCESS','Weitere':'More','Internet / mobiler Hotspot':'Internet / mobile hotspot','STARTSEITE':'HOME PAGE','Keine feste Seite - haeufig besuchte Seiten anzeigen':'No home page - show frequently visited pages','Aktuelle Seite':'Current page','Zuerst eine Webseite oeffnen':'Open a web page first','Ohne Startseite':'No home page','DARSTELLUNG':'APPEARANCE','Seitenzoom':'Page zoom','Leiste beim Lesen ausblenden':'Hide toolbar while reading','Ein':'On','Aus':'Off','Controller nach links oder die kleine Leiste oben holt die Bedienung zurueck.':'Tilt left or select the small button above to show the toolbar.','Fertig':'Done','WLAN-Name (SSID)':'Network name (SSID)','WLAN-Namen eingeben':'Enter network name','WPA-Passwort':'WPA password','Passwort eingeben':'Enter password','Verbindet ...':'Connecting ...','Verbinden':'Connect','Gespeichertes WLAN verbinden':'Connect saved network','Verbindung wird aufgebaut ...':'Connecting ...','Keine WLAN-Verbindung':'No Wi-Fi connection','Zugangsdaten bleiben im geschuetzten WLAN-Dienst der Headunit.':'Credentials stay in the protected Wi-Fi service on the head unit.','Internet erreichbar (HTTPS)':'Internet available (HTTPS)','Internet noch nicht erreichbar':'Internet not available yet','Internet pruefen':'Check internet','Adresse oder Suche':'Address or search','WLAN-Name':'Network name','Text eingeben':'Enter text','WLAN-Daten werden nicht protokolliert.':'Wi-Fi credentials are not logged.','Erstes Zeichen ersetzt die Adresse.':'The first character replaces the address.','HTTPS wird automatisch ergaenzt.':'HTTPS is added automatically.','Leerzeichen':'Space','Loeschen':'Delete','Abbrechen':'Cancel','Laedt ...':'Loading ...','Speichern':'Save','Oeffnen':'Open','Seite wird geladen ...':'Loading page ...','Browser bereit':'Browser ready','Browserleiste anzeigen':'Show browser toolbar','WLAN-Verbindung wird aufgebaut':'Connecting to Wi-Fi','Wiedergabe':'Play','Pause':'Pause','Ton ein':'Unmute','Stumm':'Mute','Vollbild verlassen':'Exit fullscreen','Medien & Streaming':'Media & streaming','Vollbild testen':'Test fullscreen',
 'Systemsprache':'System language','Webseite steuern':'Control web page','Webseite aktiv. Controller nach links: Browserleiste.':'Web page active. Tilt left for browser controls.',
 'Drehen: wählen | Drücken: ausführen | Neigen links/rechts: 10 s':'Turn: select | Press: activate | Tilt left/right: 10 s',
 'Widevine-Test öffnen':'Open Widevine test',
 'Vollbild zeigt das ganze Video ohne Beschnitt. Drehen und Drücken bleiben aktiv.':'Fullscreen fits the entire video. Turn and press remain available.',
 'Videowiedergabe in dieser Laufzeit aktiviert':'Video playback enabled in this runtime','Videowiedergabe auf der Headunit noch nicht freigegeben':'Video playback on the head unit is not enabled yet',
 'Widevine erkannt - Anbieterwiedergabe noch einzeln zu prüfen':'Widevine detected - each streaming service still needs testing','Widevine nicht verfügbar - geschützte Streams sind nicht bestätigt':'Widevine unavailable - protected streams are unconfirmed','Widevine-Prüfung: zuerst eine HTTPS-Seite öffnen':'Widevine check: open an HTTPS page first','Video wird erzeugt ...':'Generating video ...','Ja':'Yes','Nein':'No',
 'Im Emulator wird die Internetverbindung des Laptops genutzt.':'The emulator uses the laptop internet connection.'
 ,'WLAN-Netze suchen':'Scan Wi-Fi networks','WLAN-Netze in der Umgebung':'Nearby Wi-Fi networks','WLAN-Netze werden gesucht ...':'Scanning Wi-Fi networks ...','Keine sichtbaren WLAN-Netze gefunden':'No visible Wi-Fi networks found','Netz auswählen, danach das Passwort eingeben.':'Select a network, then enter its password.','Gesichert':'Secured','Offen':'Open','Erneut suchen':'Scan again'
};
const de={'gueltige':'gültige','auswaehlen':'auswählen','pruefen':'prüfen','Zurueck':'Zurück','Vorwaerts':'Vorwärts','schliessen':'schließen','Haeufig':'Häufig','haeufig':'häufig','Waehle':'Wähle','waehlt':'wählt','Druecken':'Drücken','bestaetigt':'bestätigt','oeffnen':'öffnen','zurueck':'zurück','geschuetzten':'geschützten','ergaenzt':'ergänzt','Loeschen':'Löschen','Laedt':'Lädt','Oeffnen':'Öffnen'};
Object.assign(en,{
 'Fahrzeug-Audiokanal verbunden':'Vehicle audio channel connected',
 'Fahrzeug-Audio wird verbunden ...':'Connecting vehicle audio ...',
 'Fahrzeug-Audiokanal bereits belegt':'Vehicle audio channel is already in use',
 'Fahrzeug-Audio wurde unterbrochen':'Vehicle audio was interrupted',
 'Fahrzeug-Audioverbindung nicht bereit':'Vehicle audio connection is not ready',
 'Fahrzeug-Audio bereit; startet bei Wiedergabe':'Vehicle audio ready; starts with playback',
 'Fahrzeug-Audioausgabe nicht bereit.':'Vehicle audio output is not ready.',
 'Kein Audio-Ausgang erkannt':'No audio output detected',
 'DRM-Modul nicht verwendbar; Konfiguration prüfen':'DRM module unavailable; check its configuration',
 'Kein Widevine-Modul installiert; geschützte Streams benötigen ein eigenes Modul':'Widevine is not installed; protected streams require your own module',
 'Audioquelle wird bereits verwendet.':'The audio source is already in use.',
 'Audioquelle konnte nicht übernommen werden.':'The audio source could not be taken over.',
 'Audioquelle wurde nicht rechtzeitig freigegeben.':'The audio source was not released in time.',
 'Browser konnte nicht in den Vordergrund wechseln.':'The Browser could not move to the foreground.',
 'Browser-Dienst getrennt':'Browser service disconnected',
 'Fahrzeug-Audioquelle nicht verfügbar.':'The vehicle audio source is unavailable.',
 'Fahrzeug-Audiodienst nicht erreichbar.':'The vehicle audio service is unavailable.',
 'Fahrzeug hat die Audioverbindung abgelehnt.':'The vehicle refused the audio connection.',
 'Fahrzeug-Audioverbindung nicht bereit.':'The vehicle audio connection is not ready.',
 'Fahrzeug-Audio wird von dieser Laufzeit nicht unterstützt.':'This runtime does not support vehicle audio.',
 'Fahrzeug-Audio konnte nicht verbunden werden.':'Vehicle audio could not be connected.',
 'Fahrzeug-Audio wurde unterbrochen. Wiedergabe pausieren und erneut starten.':'Vehicle audio was interrupted. Pause playback and start it again.',
 'Audio-Ausgang erkannt; Fahrzeugton unbestätigt':'Audio output detected; vehicle sound unverified',
 'Kein Audio-Ausgang erkannt; BMW-Anbindung offen':'No audio output detected; BMW integration pending',
 'Testton (1 s)':'Test tone (1 s)','Testton läuft ...':'Playing test tone ...',
 'Testton erzeugt. Hörbare Ausgabe am Gerät prüfen.':'Test tone generated. Check audible output on the device.',
 'Drehen: Wert ändern. Drücken: fertig. Links: Browserleiste.':'Turn: change value. Press: done. Left: browser toolbar.',
 'Wiedergabe / Pause':'Play / pause','Video-Vollbild':'Video fullscreen',
 'Sitzungsspeicher zurücksetzen':'Reset saved sessions','Gespeicherte Website-Anmeldungen und Cache zurücksetzen? Passwörter bleiben erhalten.':'Reset saved sign-ins and cache? Saved passwords remain.',
 'Browser-Einstellungen konnten nicht gespeichert werden':'Browser settings could not be saved','Speichereinstellungen beschädigt; Persistenz ist ausgeschaltet':'Storage settings are damaged; persistence is off',
 'Datenschutz & Logins':'Privacy & sign-ins','Angemeldet bleiben':'Keep signed in','HTTP-Cache behalten':'Keep HTTP cache','Verlauf aufzeichnen':'Record history',
 'Website-Daten löschen / abmelden':'Clear site data / sign out','HTTP-Cache löschen':'Clear HTTP cache','Verlauf löschen':'Clear history','Passwortverwaltung':'Password manager',
 'Geschützter Speicher wird geprüft ...':'Checking protected storage ...','Geschützter Speicher in dieser Laufzeit nicht verfügbar':'Protected storage is unavailable in this runtime',
 'Masterpasswort: Speicher zuerst entsperren':'Master password: unlock storage first','Masterpasswort einrichten':'Set up master password','Speicher entsperren':'Unlock storage',
 'Speichern erfolgt beim Beenden. Ohne Sitzungen bleiben Logins nur bis zum Schließen.':'Data is saved on exit. Without saved sessions, sign-ins end when the browser closes.',
 'Cookies und Logins werden laufend gesichert, auch bei Zündung aus. Ohne Sitzungen bleiben sie nur bis zum Schließen.':'Cookies and sign-ins are saved continuously, even when the ignition is switched off. Without saved sessions they end when the browser closes.',
 'Mit Handy steuern':'Control with phone','Mit Handy steuern (QR)':'Control with phone (QR)','Werbe- und Trackerblocker: Ein':'Ad and tracker blocker: On','Werbe- und Trackerblocker: Aus':'Ad and tracker blocker: Off',
 'Verbindung wird vorbereitet ...':'Preparing connection ...','Die Handy-Steuerung ist ausgeschaltet.':'Phone control is switched off.',
 'Handy und BMW müssen im selben WLAN sein, z. B. über den Hotspot des Handys.':'Phone and BMW must share a Wi-Fi network, for example the phone hotspot.',
 'Erneut versuchen':'Try again','Handy ist verbunden':'Phone connected','Mit der Handy-Kamera scannen':'Scan with your phone camera',
 '1. Kamera-App öffnen und den Code scannen.':'1. Open the camera app and scan the code.',
 '2. Am Handy Links senden, Text und Passwörter eingeben,':'2. Send links and enter text and passwords on the phone,',
 '    im Live-Bild tippen und scrollen.':'    tap and scroll in the live view.',
 'Funktioniert im WLAN des Fahrzeugs bzw. im Handy-Hotspot.':'Works in the car Wi-Fi or the phone hotspot.',
 'Endet nach 30 Minuten ohne Nutzung. Ein neuer Code macht den alten ungültig.':'Ends after 30 minutes without use. A new code invalidates the old one.',
 'Neuer Code':'New code','Verbindung beenden':'End connection','Handy verbunden':'Phone connected','Link vom Handy geöffnet':'Link from phone opened',
 'Kein WLAN verbunden. Zuerst den Handy-Hotspot verbinden.':'No Wi-Fi connected. Connect the phone hotspot first.',
 'Cookies werden verschlüsselt gesichert. Passwörter: Speicher entsperren':'Cookies are stored encrypted. Passwords: unlock storage',
 'Gespeicherte Website-Daten waren beschädigt und wurden zurückgesetzt':'Saved website data was damaged and has been reset',
 'Gespeicherte Cookies waren beschädigt und wurden verworfen':'Saved cookies were damaged and have been discarded',
 'Speichern und Ausfüllen nur auf der passenden HTTPS-Seite. Keine automatische Anmeldung.':'Save and fill only on the matching HTTPS site. Sign-in is not submitted automatically.',
 'Zugang aus aktuellem Formular speichern':'Save login from the current form','Noch keine gespeicherten Zugänge':'No saved logins yet','Ausfüllen':'Fill','Löschen':'Delete',
 'Website-Daten löschen und alle Websites abmelden?':'Clear site data and sign out of all websites?','Gespeicherten HTTP-Cache löschen?':'Clear the saved HTTP cache?',
 'Den lokalen Browser-Verlauf löschen?':'Clear local browser history?','Diesen gespeicherten Zugang löschen?':'Delete this saved login?',
 'Löschen bestätigen':'Confirm deletion','Diese Aktion lässt sich nicht rückgängig machen.':'This action cannot be undone.','Daten gelöscht':'Data cleared',
 'Masterpasswort':'Master password','Masterpasswort bestätigen':'Confirm master password','Masterpasswort benötigt mindestens 12 Zeichen':'The master password needs at least 12 characters',
 'Masterpasswörter stimmen nicht überein':'Master passwords do not match','Geschützter Speicher entsperrt':'Protected storage unlocked',
 'Zugang verschlüsselt gespeichert':'Login saved encrypted','Zugang ausgefüllt':'Login filled'
});
Object.assign(en,{
 'Bitte eine gueltige Webadresse eingeben':'Enter a valid web address',
 'Browser beendet':'Browser stopped',
 'Website-Daten sind nicht vollstaendig gespeichert. Datenschutz & Logins oeffnen.':'Website data has not been fully saved. Open Privacy & sign-ins.',
 'Datum / Uhrzeit':'Date / time','Links':'Left','Rechts':'Right','Alles':'Select all',
 'JJJJ-MM-TT':'YYYY-MM-DD','JJJJ-MM':'YYYY-MM','JJJJ-Www':'YYYY-Www','JJJJ-MM-TTTHH:MM':'YYYY-MM-DDTHH:MM',
 'Seite verlassen?':'Leave this page?','Meldung der Webseite':'Website message','Antwort eingeben':'Enter a response','Verlassen':'Leave',
 'Proxy-Anmeldung':'Proxy sign-in','Anmeldung der Webseite':'Website sign-in','Benutzername eingeben':'Enter username','Anmelden':'Sign in',
 'HTTP-Verbindung ist nicht verschluesselt.':'The HTTP connection is not encrypted.','Anmeldung ist abgelaufen':'The sign-in request has expired',
 'Berechtigung fuer diese Webseite':'Permission for this website','Website-Berechtigungen':'Site permissions',
 'Standort':'Location','Benachrichtigungen':'Notifications','Kamera':'Camera','Mikrofon':'Microphone',
 'Zwischenablage lesen':'Read clipboard','Zwischenablage schreiben':'Write clipboard',
 'Eingebettet in':'Embedded in','Eingebettet in ':'Embedded in ',
 'Erlauben':'Allow','Blockieren':'Block','Erlaubt':'Allowed','Blockiert':'Blocked','Fragen':'Ask','Nicht verfuegbar':'Unavailable',
 'Datei fuer die Webseite auswaehlen':'Select a file for the website',
 'Datei auf dem Handy auswaehlen und an diese Webseite senden.':'Select a file on your phone and send it to this website.',
 'Dateitypen:':'File types:','Dateitypen: ':'File types: ','Alle Dateitypen':'All file types',
 'Mehrere Dateien sind erlaubt.':'Multiple files are allowed.','Eine Datei ist erlaubt.':'One file is allowed.',
 'Handy verbinden / Datei senden':'Connect phone / send file','Noch keine Downloads.':'No downloads yet.',
 'Downloads auf dem Handy oeffnen':'Open downloads on your phone',
 'downloading':'Downloading','completed':'Completed','cancelled':'Cancelled','failed':'Failed',
 'Wird geladen':'Downloading','Abgeschlossen':'Completed','Abgebrochen':'Cancelled','Fehlgeschlagen':'Failed',
 'Auf der Seite suchen':'Find on page','Treffer':'Match','Kein Treffer':'No match',
 'Webseite wurde gewechselt':'The web page has changed','Eingaberahmen wurde gewechselt':'The input frame has changed',
 'Eingabefeld wurde gewechselt':'The input field has changed','Eingabefeld konnte nicht geprueft werden':'The input field could not be checked',
 'Ungueltige Tastenmodifikatoren':'Invalid key modifiers','Ungueltige Taste':'Invalid key',
 'Ungueltige Zeigerposition':'Invalid pointer position','Ungueltige Zeigeroptionen':'Invalid pointer options',
 'Ungueltiger Ziehpfad':'Invalid drag path','Ungueltiger Bildlauf':'Invalid scroll input','Ungueltige Browsergroesse':'Invalid browser size',
 'Texteingabe muss hoechstens 64 KiB UTF-8 enthalten':'Text input must be no larger than 64 KiB in UTF-8',
 'Fuer dieses Feld die Datums- oder Zeiteingabe verwenden':'Use date or time entry for this field',
 'Ungueltige Controller-Drehung':'Invalid controller rotation','Ungueltiges Datums- oder Zeitfeld':'Invalid date or time field',
 'Datum als JJJJ-MM-TT eingeben':'Enter a date as YYYY-MM-DD','Ungueltiges Datum':'Invalid date',
 'Datum und Zeit als JJJJ-MM-TTTHH:MM eingeben':'Enter a date and time as YYYY-MM-DDTHH:MM',
 'Monat als JJJJ-MM eingeben':'Enter a month as YYYY-MM','Woche als JJJJ-Www eingeben':'Enter a week as YYYY-Www',
 'Ungueltige Kalenderwoche':'Invalid calendar week','Zeit als HH:MM eingeben':'Enter a time as HH:MM',
 'Zuerst ein Datums- oder Zeitfeld auswaehlen':'Select a date or time field first',
 'Dieses Eingabefeld ist nicht bearbeitbar':'This input field cannot be edited',
 'Datums- oder Zeitsteuerung nicht verfuegbar':'Date or time control is unavailable',
 'Dieses Zeitfeld unterstuetzt die angegebene Genauigkeit nicht':'This time field does not support that precision',
 'Datums- oder Zeitwert konnte nicht vollstaendig gesetzt werden':'The date or time could not be entered completely',
 'Ungültige Dialogantwort':'Invalid dialog response','Website-Dialog ist nicht mehr aktuell':'The website dialog has expired',
 'Website-Dialog konnte nicht beantwortet werden':'The website dialog could not be answered',
 'Ungültige Anmeldeantwort':'Invalid sign-in response','Website-Anmeldung ist nicht mehr aktuell':'The website sign-in request has expired',
 'Ungültige Anmeldedaten':'Invalid sign-in details','Website-Anmeldung konnte nicht beantwortet werden':'The website sign-in request could not be answered',
 'Ungueltige Sucheinstellung':'Invalid search option','Suchtext darf hoechstens 256 Zeichen enthalten':'Search text must be no longer than 256 characters',
 'Suche wurde geschlossen':'Find was closed','Suchrahmen wurde gewechselt':'The search frame has changed',
 'Suche dauert zu lange':'Search took too long','Zu viele Rahmen fuer die Seitensuche':'Too many frames to search this page',
 'Webseite kann nicht durchsucht werden':'This web page cannot be searched','Webseite konnte nicht durchsucht werden':'The web page could not be searched'
});
Object.assign(de,{'fuer':'für','Fuer':'Für','verfuegbar':'verfügbar','vollstaendig':'vollständig','unterstuetzt':'unterstützt','hoechstens':'höchstens','groesse':'größe','verschluesselt':'verschlüsselt'});
const deMessages={
 downloading:'Wird heruntergeladen',completed:'Abgeschlossen',cancelled:'Abgebrochen',failed:'Fehlgeschlagen',
 'Secure website required for permissions':'Berechtigungen benötigen eine sichere Webseite',
 'Permission page changed':'Webseite wurde gewechselt','Permission frame changed':'Website-Rahmen wurde gewechselt',
 'Unsupported website permission':'Diese Website-Berechtigung wird nicht unterstützt',
 'Website permission origin required':'Website-Adresse für die Berechtigung fehlt',
 'Permission website changed':'Webseite wurde gewechselt','Unsupported permission decision':'Ungültige Berechtigungsantwort',
 'Permission request expired':'Berechtigungsanfrage ist abgelaufen'
};
function normalize(value){const s=String(value||'').replace(/_/g,'-');return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s)?s:'en-GB';}
class BrowserLocale{
    constructor(app,changed){
        this.units=app&&app.currentVehicleUnits;this.changed=changed||(()=>{});this.language='en-GB';
        this.refresh=()=>{let value;try{value=this.units&&this.units.getLanguage();}catch(e){}
            this.language=normalize(value||process.env.MGU_EMULATOR_LOCALE||'en-GB');this.changed(this.language);};
        this.refresh();if(this.units&&this.units.on)this.units.on('languageChanged',this.refresh);
    }
    text(value){
        const s=String(value==null?'':value);if(this.language.toLowerCase().startsWith('de'))return deMessages[s]||s.replace(/gueltige|auswaehlen|pruefen|Zurueck|Vorwaerts|schliessen|Haeufig|haeufig|Waehle|waehlt|Druecken|bestaetigt|oeffnen|zurueck|geschuetzten|ergaenzt|Loeschen|Laedt|Oeffnen|fuer|Fuer|verfuegbar|vollstaendig|unterstuetzt|hoechstens|groesse|verschluesselt/g,m=>de[m]);
        const translated=en[s]||s;
        // Explicit Traditional Chinese locales keep the existing English fallback.
        if (/^zh(?:-|$)/i.test(this.language) && !/^zh-(?:Hant|TW|HK|MO)(?:-|$)/i.test(this.language))return zhCN[translated]||translated;
        return translated;
    }
    keyboard(){
        const lang=this.language.slice(0,2).toLowerCase();
        if(lang==='de')return ['qwertzuiop','asdfghjkl','yxcvbnm','äöüß.-/:'];
        if(lang==='fr')return ['azertyuiop','qsdfghjklm','wxcvbn','éèêëàâçùôî'];
        if(lang==='es')return ['qwertyuiop','asdfghjklñ','zxcvbnm','áéíóúü.-/'];
        if(lang==='it')return ['qwertyuiop','asdfghjkl','zxcvbnm','àèéìòù.-/'];
        if(lang==='ru')return ['йцукенгшщз','фывапролдж','ячсмитьбю','ёхъэ.-/:'];
        return ['qwertyuiop','asdfghjkl','zxcvbnm','.-/:@_?!'];
    }
    close(){if(this.units&&this.units.removeListener)this.units.removeListener('languageChanged',this.refresh);}
}
module.exports={BrowserLocale,normalize};
