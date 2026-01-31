🌐 [English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Secret Code](README.pig.md)

# PBE Marcador
Una herramienta para ayudar a llevar el registro de las puntuaciones de la Experiencia Bíblica Pathfinder (PBE) (también conocida como Bible Bowl) por bloque y equipo.

## Nota sobre Almacenamiento de Datos
Los datos se almacenan solo en su dispositivo y no se comparten de ninguna manera con ningún servidor. Esto significa que estos datos solo están en su dispositivo actual, y que debe usar las opciones de Exportar Datos en Importar/Exportar si necesita guardar copias de estos datos.

## Nota sobre Sincronización en Tiempo Real
La función de Sincronización en Tiempo Real permite que múltiples dispositivos colaboren en la misma sesión usando comunicación entre pares. Aunque el sistema de sincronización incluye múltiples protecciones contra la pérdida de datos, existe un escenario extremadamente raro que podría resultar en una fusión inesperada de datos:

**Condiciones requeridas (todas deben ocurrir simultáneamente):**
1. El servidor de sincronización no está disponible temporalmente
2. Dos usuarios crean salas exactamente al mismo tiempo
3. Ambos generan aleatoriamente el mismo código de sala de 6 caracteres (probabilidad de 1 en 1.073.741.824)
4. Ambos usuarios ingresan la misma contraseña

Si las cuatro condiciones se alinean, las dos sesiones separadas fusionarían sus datos. Este escenario es astronómicamente improbable en la práctica, pero se documenta aquí para completar la información. Usar la función de sincronización sin contraseña (el valor predeterminado) previene este problema por completo cuando el servidor está disponible.

## Contribuir una Traducción

¿Quiere ayudar a traducir PBE Marcador a su idioma? ¡Nos encantaría su ayuda!

**Para contribuir una traducción:**
1. Copie `scripts/i18n/es.js` como punto de partida
2. Traduzca todas las cadenas de texto a su idioma
3. Envíe un [Pull Request](https://github.com/antgiant/PBE_Score_Keeper/pulls) con su traducción

**¿No está seguro de cómo crear un Pull Request?** ¡No hay problema! Puede:
- [Abrir un Issue](https://github.com/antgiant/PBE_Score_Keeper/issues/new?title=Nueva%20Traducción:%20[Nombre%20del%20Idioma]&body=Me%20gustaría%20contribuir%20una%20traducción%20para%20[idioma].%0A%0A) para informarnos que le gustaría ayudar
- Adjunte su archivo traducido al issue y lo agregaremos por usted

Vea [AGENTS.md](AGENTS.md#adding-a-new-language) para instrucciones detalladas sobre el formato de traducción.

## Detalles Técnicos
[Detalles Técnicos](TECH.md)
