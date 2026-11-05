'use strict';
// Language comes from the same CurrentVehicleUnits object the BMW SDK uses.
const en={
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
function normalize(value){const s=String(value||'').replace(/_/g,'-');return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(s)?s:'en-GB';}
class BrowserLocale{
    constructor(app,changed){
        this.units=app&&app.currentVehicleUnits;this.changed=changed||(()=>{});this.language='en-GB';
        this.refresh=()=>{let value;try{value=this.units&&this.units.getLanguage();}catch(e){}
            this.language=normalize(value||process.env.MGU_EMULATOR_LOCALE||'en-GB');this.changed(this.language);};
        this.refresh();if(this.units&&this.units.on)this.units.on('languageChanged',this.refresh);
    }
    text(value){
        const s=String(value==null?'':value);if(this.language.toLowerCase().startsWith('de'))return s.replace(/gueltige|auswaehlen|pruefen|Zurueck|Vorwaerts|schliessen|Haeufig|haeufig|Waehle|waehlt|Druecken|bestaetigt|oeffnen|zurueck|geschuetzten|ergaenzt|Loeschen|Laedt|Oeffnen/g,m=>de[m]);
        return en[s]||s;
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
