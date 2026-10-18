# Publicar CulturaBA en la App Store y en Google Play

CulturaBA ya es una app de **Expo / React Native**: el mismo código genera la web que está
en producción y las apps de iPhone y Android. No hay que reescribir nada; hay que
**compilarla, completar lo que en el teléfono funciona distinto y pasar la revisión** de
cada tienda. Esta guía cuenta el camino y lo que falta, en orden.

> Precios, tamaños y reglas de las tiendas cambian: verificalos al registrarte.

## 1. Cuentas que hacen falta

| Qué | Costo | Notas |
|---|---|---|
| **Apple Developer Program** (developer.apple.com) | USD 99 por año | Como persona o como organización. Como organización, la tienda muestra el nombre de la empresa y Apple pide un número D-U-N-S (gratis, tarda unos días). |
| **Google Play Console** (play.google.com/console) | USD 25, una vez | Las cuentas personales nuevas deben hacer una prueba cerrada con al menos 12 personas durante 14 días antes de publicar. |
| **Expo / EAS** (expo.dev) | Plan gratis alcanza para empezar | Compila en la nube: **no hace falta una Mac**. |

## 2. Cómo se compila y se sube (EAS)

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build:configure                         # crea eas.json (perfiles development / preview / production)
eas build -p ios --profile production       # .ipa firmada (EAS gestiona certificados y perfiles)
eas submit -p ios                           # la sube a App Store Connect
eas build -p android --profile production   # .aab para Google Play
eas submit -p android
```

- **TestFlight** (iPhone): la versión subida se prueba primero ahí. Hasta 100 personas del
  equipo sin revisión; hasta 10.000 externas con una revisión corta.
- **Prueba interna / cerrada** (Android): el equivalente en Play Console.
- **Actualizaciones**: los cambios de JavaScript (pantallas, textos, lógica) se mandan con
  `eas update` sin pasar de nuevo por la revisión; los cambios nativos (permisos, módulos
  nuevos) piden una compilación y revisión nuevas.

## 3. Qué falta en la app para el teléfono

| Pieza | Hoy | Para las tiendas |
|---|---|---|
| **Iniciar sesión con Apple** | — | **Obligatorio** en iPhone si se ofrece Google (pauta 4.8 de Apple). `expo-apple-authentication` + `signInWithIdToken` de Supabase y el proveedor Apple activado en Supabase (con la cuenta de Apple Developer). |
| **Google en el teléfono** | Programado (abre el navegador del sistema y vuelve a `culturaba://cuenta`) | Probarlo en un dispositivo real; opcional: el SDK nativo de Google para el selector de cuentas. |
| **Eliminar cuenta** | ✅ en Cuenta y seguridad | Apple lo exige a toda app que permite crear cuentas (pauta 5.1.1(v)). |
| **Mapa** | Solo en la web (Leaflet) | `react-native-maps` (Apple Maps en iPhone, sin costo). En el teléfono Explorar hoy muestra la lista. |
| **Recordatorios** | Esquema listo, sin envío | `expo-notifications` (APNs / FCM) para "mañana es la función". |
| **Agregar al calendario** | Descarga un .ics | `expo-calendar` lo agrega directo al calendario del teléfono. |
| **Enlaces que abren la app** | Configurados en `app.config.ts` | Publicar `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` en el dominio (con el Team ID de Apple y la huella de Android). |
| **Ícono y pantalla de inicio** | Provisorios | Ícono 1024×1024 sin transparencia; splash con la paleta Telón. |
| **Permiso de ubicación** | Lo pide el mapa | Texto del permiso (`NSLocationWhenInUseUsageDescription`): "Para mostrarte las salas cerca tuyo. No guardamos tu ubicación." |
| **Cifrado** | Solo HTTPS | `ITSAppUsesNonExemptEncryption: false` en `ios.infoPlist`, así no pide documentación de exportación. |

## 4. Lo que piden las fichas de las tiendas

- **Nombre, subtítulo y descripción** en español; palabras clave (iPhone).
- **Capturas**: iPhone de 6,9" (y las demás se derivan); Android, teléfono. Salen del
  recorrido de `scripts/screenshot-web.cjs` en el simulador o en un dispositivo.
- **Política de privacidad** (URL pública, obligatoria) y **URL de soporte**. Contar qué se
  guarda: email, diario, puntos, amigos; la ubicación no se guarda; sin publicidad ni
  rastreo.
- **Privacidad de la app** (las "etiquetas" de Apple) y **Seguridad de los datos**
  (Google): los mismos datos, marcados como vinculados a la cuenta y no usados para rastreo.
- **Clasificación por edad** (cuestionario) y **categoría**: Estilo de vida o Entretenimiento.
- **Acceso para la revisión**: no hace falta cuenta de prueba porque se puede usar como
  invitado; conviene explicarlo en las notas para el revisor.

## 5. Antes de enviar a revisión

1. **Resend** configurado (los emails de confirmación y de "olvidé mi contraseña" tienen que
   llegar a cualquiera, no solo al equipo).
2. **Google y Apple** activados en Supabase y probados en un iPhone y un Android reales.
3. **Mapa nativo** y **recordatorios**, o sacarlos de la versión 1.0 y avisarlo en la ficha.
4. **Política de privacidad** publicada en el dominio.
5. Recorrido completo en TestFlight y en la prueba cerrada de Play, sin errores.

Plazos habituales: la revisión de Apple suele tardar 1 a 3 días; Google, de horas a
pocos días (más la prueba cerrada de 14 días si la cuenta es personal y nueva). Si
rechazan, explican la pauta y se reenvía.

---

## Anexo A — Activar "Seguir con Google"

1. **Google Cloud Console** (console.cloud.google.com): proyecto nuevo "CulturaBA".
2. **Pantalla de consentimiento de OAuth** (Google Auth Platform → Branding/Audience):
   tipo *Externo*, nombre "CulturaBA", email de soporte, dominios autorizados
   `xn--lembodiseo-19a.com` y `<ref>.supabase.co`; permisos `openid`, `email`, `profile`.
   **Publicar** la app (si queda en prueba, solo entran los usuarios de prueba).
3. **Credenciales → Crear ID de cliente de OAuth → Aplicación web**:
   - Orígenes autorizados: `https://culturaba.xn--lembodiseo-19a.com`
   - URI de redirección: la que muestra Supabase en el panel de Google,
     `https://<ref>.supabase.co/auth/v1/callback`
4. **Supabase → Authentication → Sign In / Providers → Google**: activarlo y pegar el
   *Client ID* y el *Client Secret*.
5. En la misma sección, activar **Allow manual linking** (así el invitado suma Google a su
   sesión y conserva lo guardado).
6. **Authentication → URL Configuration → Redirect URLs**: agregar
   `https://culturaba.xn--lembodiseo-19a.com/**` y `culturaba://**`.

El botón aparece solo en la app (lee el ajuste público de Supabase): no hace falta
publicar una versión nueva.

## Anexo B — Activar los emails para todos (Resend)

1. En Resend: verificar el dominio (registros DNS) y crear una API key.
2. **Supabase → Authentication → Emails → SMTP Settings**: host `smtp.resend.com`,
   puerto `465`, usuario `resend`, contraseña = la API key, remitente
   `CulturaBA <hola@tu-dominio>`.
3. Subir las plantillas con código (`supabase/templates/`):
   `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=<ref> bash scripts/push-auth-emails.sh`,
   o pegarlas a mano en *Emails → Templates* ("Change email address" y "Reset password").
4. Probar: crear una cuenta con email y contraseña, y "¿Olvidaste tu contraseña?".
