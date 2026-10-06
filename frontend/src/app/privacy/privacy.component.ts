import { Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="privacy">
      @if (i18n.lang() === 'it') {
        <h1>Informativa sulla privacy</h1>
        <p class="updated">Ultimo aggiornamento: 6 ottobre 2026</p>

        <section>
          <h2>Titolare del trattamento</h2>
          <p>
            Il Titolare del trattamento dei dati personali è <strong>Michele Pasetto</strong>,
            contattabile all'indirizzo email indicato in fondo a questa pagina.
          </p>
        </section>

        <section>
          <h2>Cosa fa questa app</h2>
          <p>
            <strong>Formulino</strong> trasforma un input JSON in un Google Form. Utilizza
            Google OAuth per richiedere il permesso di creare form nel tuo account Google.
          </p>
        </section>

        <section>
          <h2>Dati trattati, finalità e base giuridica</h2>
          <ul>
            <li><strong>Token di accesso OAuth</strong> — dopo l'autorizzazione, Google emette un token di accesso di breve durata. È consegnato al browser tramite frammento URL (la parte <code>#…</code> dell'indirizzo), che i browser non trasmettono né registrano nei log dei server. È salvato nel <code>sessionStorage</code> del browser per la durata della scheda e cancellato alla chiusura. È inviato al nostro server solo nell'header <code>Authorization</code> al momento della creazione del form e non viene registrato né conservato lato server. <em>Finalità:</em> creare il Google Form richiesto. <em>Base giuridica:</em> esecuzione di un servizio richiesto dall'utente (art. 6.1.b GDPR).</li>
            <li><strong>Contenuto JSON del form</strong> — il JSON incollato nell'editor è inviato al nostro server esclusivamente per creare il form tramite l'API di Google Forms. Non viene registrato né conservato dopo la chiamata. <em>Finalità/base giuridica:</em> come sopra.</li>
            <li><strong>Contatore anonimo dei form creati</strong> — a ogni form creato con successo salviamo sul server solo la data (giorno, senza ora) in un semplice file di testo, per mostrare nel sito quanti form sono stati creati. Non è collegato a utenti, account Google, indirizzi IP, token o contenuti del form e non consente di identificare nessuno. <em>Finalità:</em> statistiche aggregate di utilizzo. <em>Base giuridica:</em> legittimo interesse (art. 6.1.f GDPR) su dati non personali.</li>
          </ul>
        </section>

        <section>
          <h2>Dati che NON raccogliamo</h2>
          <ul>
            <li>Non conserviamo le tue credenziali Google né i token OAuth in modo persistente.</li>
            <li>Non tracciamo l'utilizzo con strumenti di analytics (l'unico dato di utilizzo è il contatore anonimo dei form creati, composto da sole date) e non vendiamo alcun dato a terzi.</li>
            <li>Non conserviamo il JSON o il contenuto del form dopo il completamento della chiamata API.</li>
            <li>Non effettuiamo profilazione né processi decisionali automatizzati.</li>
            <li>Non richiediamo a Google alcuna informazione identificativa (nome, email, foto profilo): l'accesso richiede al tuo account Google esclusivamente il permesso di creare form (scope <code>forms.body</code>), in linea con il principio di minimizzazione dei dati (art. 5.1.c GDPR).</li>
          </ul>
        </section>

        <section>
          <h2>Cookie e tecnologie di archiviazione locale</h2>
          <p>
            Formulino utilizza un cookie tecnico e tecnologie di archiviazione equivalenti,
            disciplinati dall'art. 122 del Codice in materia di protezione dei dati personali
            (D.Lgs. 196/2003, come modificato dal D.Lgs. 101/2018):
          </p>
          <table class="storage-table">
            <thead>
              <tr><th>Tecnologia</th><th>Dato</th><th>Finalità</th><th>Durata</th><th>Consenso</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>cookie</code> (HttpOnly, SameSite=Lax)</td>
                <td><code>formulino_oauth_state</code></td>
                <td>Protezione CSRF del flusso di login Google (verifica che la risposta OAuth appartenga a questo browser)</td>
                <td>5 minuti — cancellato non appena il login è completato</td>
                <td>Non richiesto — tecnicamente necessario (art. 122.1 Codice privacy)</td>
              </tr>
              <tr>
                <td><code>sessionStorage</code></td>
                <td><code>access_token</code></td>
                <td>Autenticare le chiamate API durante la creazione del form</td>
                <td>Fino alla chiusura della scheda</td>
                <td>Non richiesto — tecnicamente necessario per il servizio esplicitamente richiesto (art. 122.1)</td>
              </tr>
              <tr>
                <td><code>sessionStorage</code></td>
                <td><code>pending_dsl</code></td>
                <td>Conservare temporaneamente il JSON in corso di modifica durante il login Google</td>
                <td>Fino alla chiusura della scheda o all'uso</td>
                <td>Non richiesto — tecnicamente necessario</td>
              </tr>
              <tr>
                <td><code>localStorage</code></td>
                <td><code>lang</code></td>
                <td>Ricordare la lingua dell'interfaccia scelta (italiano/inglese)</td>
                <td>Persistente, fino a cancellazione manuale</td>
                <td>Trattato come dato tecnico/funzionale di preferenza — nessun tracciamento, nessuna condivisione con terzi</td>
              </tr>
            </tbody>
          </table>
          <p>Nessuno di questi dati è condiviso con terze parti, né usato per pubblicità o profilazione.</p>
        </section>

        <section>
          <h2>Destinatari e trasferimenti dei dati</h2>
          <ul>
            <li><strong>Google LLC / Google Ireland Limited</strong> — riceve le chiamate API per creare il form nel tuo account Google Drive. Il trattamento da parte di Google è regolato dalla <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">privacy policy di Google</a>. Google aderisce al Data Privacy Framework UE-USA per i trasferimenti di dati verso gli Stati Uniti.</li>
            <li><strong>Railway</strong> (fornitore dell'infrastruttura di hosting) — ospita l'applicazione ed elabora i log tecnici standard del server (indirizzo IP, timestamp, percorso della richiesta) per finalità operative e di sicurezza.</li>
          </ul>
          <p>Non trasferiamo dati ad altre terze parti oltre a quelle sopra elencate.</p>
        </section>

        <section>
          <h2>Conservazione dei dati</h2>
          <ul>
            <li>Access token e contenuto JSON del form: mai conservati lato server, scartati subito dopo l'elaborazione della richiesta.</li>
            <li>Log tecnici del server (hosting): conservati per il periodo minimo necessario a garantire sicurezza e diagnosi di problemi, secondo le policy del fornitore di hosting.</li>
            <li>Preferenza di lingua (<code>localStorage</code>): conservata sul tuo dispositivo finché non la cancelli manualmente o svuoti i dati del browser.</li>
          </ul>
        </section>

        <section>
          <h2>I tuoi diritti</h2>
          <p>
            Poiché Formulino non conserva dati persistenti collegati alla tua identità, la maggior
            parte dei tuoi dati risiede nel tuo account Google e nel tuo browser, sui quali hai già
            pieno controllo. Ai sensi degli artt. 15–22 GDPR hai comunque diritto a: accesso,
            rettifica, cancellazione, limitazione del trattamento, portabilità dei dati e
            opposizione al trattamento. Puoi revocare in qualsiasi momento l'autorizzazione
            concessa a Formulino tramite
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">le impostazioni del tuo account Google</a>.
            Per esercitare questi diritti relativamente a qualsiasi informazione ancora in nostro
            possesso, contattaci all'indirizzo indicato in fondo alla pagina.
          </p>
        </section>

        <section>
          <h2>Reclamo al Garante</h2>
          <p>
            Hai il diritto di proporre reclamo al
            <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">Garante per la protezione dei dati personali</a>
            qualora ritenga che il trattamento dei tuoi dati violi la normativa vigente.
          </p>
        </section>

        <section>
          <h2>Minori</h2>
          <p>
            Formulino non è rivolto specificamente a minori. L'utilizzo dell'app richiede un
            account Google, soggetto ai requisiti di età stabiliti da Google stessa.
          </p>
        </section>

        <section>
          <h2>Modifiche a questa informativa</h2>
          <p>Possiamo aggiornare questa informativa periodicamente. La data dell'ultimo aggiornamento è indicata in cima alla pagina.</p>
        </section>

        <section>
          <h2>Contatti</h2>
          <p>
            Per qualsiasi domanda relativa alla privacy, contatta:
            <a href="mailto:michele.pasetto@protonmail.com">michele.pasetto&#64;protonmail.com</a>
          </p>
        </section>
      } @else {
        <h1>Privacy Policy</h1>
        <p class="updated">Last updated: October 6, 2026</p>

        <section>
          <h2>Data Controller</h2>
          <p>
            The Data Controller for this application is <strong>Michele Pasetto</strong>,
            reachable at the email address listed at the bottom of this page.
          </p>
        </section>

        <section>
          <h2>What this app does</h2>
          <p>
            <strong>Formulino</strong> converts JSON input into Google Forms on your behalf.
            It uses Google OAuth to request permission to create forms in your Google account.
          </p>
        </section>

        <section>
          <h2>Data we process, purposes and legal basis</h2>
          <ul>
            <li><strong>OAuth access token</strong> — after you authorise Formulino, Google issues a short-lived access token. It is delivered to your browser via a URL fragment (the <code>#…</code> part of the address bar), which browsers never transmit to servers or record in server logs. The token is stored in your browser's <code>sessionStorage</code> for the duration of your tab session and cleared when the tab is closed. It is sent to our server only inside the <code>Authorization</code> request header when creating a form, and is not logged or stored server-side. <em>Purpose:</em> create the Google Form you requested. <em>Legal basis:</em> performance of a service explicitly requested by you (GDPR Art. 6(1)(b)).</li>
            <li><strong>JSON form content</strong> — the JSON you paste into the editor is sent to our server only to create the form via the Google Forms API. It is not logged or stored after the call completes. <em>Purpose/legal basis:</em> as above.</li>
            <li><strong>Anonymous created-forms counter</strong> — each time a form is successfully created we store only the date (day, no time) in a plain text file on the server, to show on the site how many forms have been created. It is not linked to users, Google accounts, IP addresses, tokens or form content and cannot identify anyone. <em>Purpose:</em> aggregate usage statistics. <em>Legal basis:</em> legitimate interest (GDPR Art. 6(1)(f)) on non-personal data.</li>
          </ul>
        </section>

        <section>
          <h2>Data we do NOT collect</h2>
          <ul>
            <li>We do not store your Google credentials or OAuth tokens persistently.</li>
            <li>We do not use analytics tools (the only usage data is the anonymous created-forms counter, made of dates only) and do not sell any data to third parties.</li>
            <li>We do not retain the JSON or form content after the API call completes.</li>
            <li>We do not perform profiling or automated decision-making.</li>
            <li>We do not request any identifying information from Google (name, email, profile photo): sign-in only requests permission to create forms in your account (the <code>forms.body</code> scope), in line with the data-minimisation principle (GDPR Art. 5(1)(c)).</li>
          </ul>
        </section>

        <section>
          <h2>Cookies and local storage technologies</h2>
          <p>
            Formulino uses one technical cookie and equivalent local storage technologies,
            governed by Article 122 of the Italian Data Protection Code (Legislative Decree
            196/2003, as amended by Legislative Decree 101/2018), which implements the ePrivacy
            Directive:
          </p>
          <table class="storage-table">
            <thead>
              <tr><th>Technology</th><th>Data</th><th>Purpose</th><th>Duration</th><th>Consent</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>cookie</code> (HttpOnly, SameSite=Lax)</td>
                <td><code>formulino_oauth_state</code></td>
                <td>CSRF protection for the Google sign-in flow (proves the OAuth response belongs to this browser)</td>
                <td>5 minutes — deleted as soon as the login completes</td>
                <td>Not required — strictly necessary (ePrivacy strictly-necessary exemption, Art. 122(1))</td>
              </tr>
              <tr>
                <td><code>sessionStorage</code></td>
                <td><code>access_token</code></td>
                <td>Authenticate API calls while creating the form</td>
                <td>Until the browser tab is closed</td>
                <td>Not required — strictly necessary for the service you explicitly requested (Art. 122(1))</td>
              </tr>
              <tr>
                <td><code>sessionStorage</code></td>
                <td><code>pending_dsl</code></td>
                <td>Temporarily hold the JSON you were editing while you complete Google sign-in</td>
                <td>Until the tab is closed or the value is consumed</td>
                <td>Not required — strictly necessary</td>
              </tr>
              <tr>
                <td><code>localStorage</code></td>
                <td><code>lang</code></td>
                <td>Remember your chosen interface language (Italian/English)</td>
                <td>Persistent, until manually cleared</td>
                <td>Treated as technical/functional preference data — no tracking, no sharing with third parties</td>
              </tr>
            </tbody>
          </table>
          <p>None of this data is shared with third parties, or used for advertising or profiling.</p>
        </section>

        <section>
          <h2>Recipients and international data transfers</h2>
          <ul>
            <li><strong>Google LLC / Google Ireland Limited</strong> — receives the API calls needed to create the form in your Google Drive account. Google's processing is governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google's Privacy Policy</a>. Google participates in the EU-US Data Privacy Framework for transfers of data to the United States.</li>
            <li><strong>Railway</strong> (hosting infrastructure provider) — hosts the application and processes standard technical server logs (IP address, timestamp, request path) for operational and security purposes.</li>
          </ul>
          <p>We do not transfer data to any third party other than those listed above.</p>
        </section>

        <section>
          <h2>Data retention</h2>
          <ul>
            <li>Access tokens and JSON form content: never stored server-side, discarded immediately after the request is processed.</li>
            <li>Technical server logs (hosting): retained for the minimum period necessary for security and troubleshooting, per our hosting provider's policies.</li>
            <li>Language preference (<code>localStorage</code>): retained on your device until you manually clear it or your browser data.</li>
          </ul>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            Because Formulino does not retain persistent data tied to your identity, most of your
            data lives in your Google account and your browser, over which you already have full
            control. Under GDPR Articles 15–22 you still have the right to: access, rectification,
            erasure, restriction of processing, data portability, and objection to processing. You
            can revoke Formulino's access at any time via
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">your Google Account permissions</a>.
            To exercise these rights over any information we still hold, contact us at the address
            listed at the bottom of this page.
          </p>
        </section>

        <section>
          <h2>Complaints to a supervisory authority</h2>
          <p>
            You have the right to lodge a complaint with the Italian data protection authority,
            the <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">Garante per la protezione dei dati personali</a>,
            or with your own country's supervisory authority, if you believe our processing of
            your data violates applicable law.
          </p>
        </section>

        <section>
          <h2>Minors</h2>
          <p>
            Formulino is not specifically directed at children. Using the app requires a Google
            account, which is subject to Google's own age requirements.
          </p>
        </section>

        <section>
          <h2>Changes to this policy</h2>
          <p>We may update this policy from time to time. The date of the last update is shown at the top of this page.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For any privacy-related questions, contact:
            <a href="mailto:michele.pasetto@protonmail.com">michele.pasetto&#64;protonmail.com</a>
          </p>
        </section>
      }

      <a routerLink="/" class="back">{{ i18n.lang() === 'it' ? "← Torna all'app" : '← Back to app' }}</a>
    </main>
  `,
  styles: [`
    .privacy {
      max-width: 720px;
      margin: 3rem auto;
      padding: 0 1.5rem 4rem;
      color: var(--text-primary);
      line-height: 1.7;
    }

    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: .25rem;
    }

    .updated {
      color: var(--text-secondary);
      font-size: .85rem;
      margin-bottom: 2rem;
    }

    h2 {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 2rem 0 .5rem;
      color: var(--text-primary);
    }

    p, li {
      color: var(--text-secondary);
      font-size: .92rem;
    }

    ul {
      padding-left: 1.25rem;
    }

    li {
      margin-bottom: .4rem;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    code {
      font-size: .85em;
      background: var(--surface, rgba(127,127,127,.15));
      padding: .1em .35em;
      border-radius: 4px;
    }

    .storage-table {
      width: 100%;
      border-collapse: collapse;
      margin: .75rem 0 1rem;
      font-size: .85rem;
    }

    .storage-table th,
    .storage-table td {
      text-align: left;
      padding: .5rem .6rem;
      border: 1px solid var(--border);
      vertical-align: top;
      color: var(--text-secondary);
    }

    .storage-table th {
      color: var(--text-primary);
      font-weight: 600;
    }

    .back {
      display: inline-block;
      margin-top: 2.5rem;
      font-size: .88rem;
    }
  `],
})
export class PrivacyComponent implements OnInit {
  constructor(
    private readonly title: Title,
    readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.title.setTitle(
      this.i18n.lang() === 'it' ? 'Informativa sulla privacy | Formulino' : 'Privacy Policy | Formulino',
    );
  }
}
