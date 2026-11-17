# ADR-03: Escalabilidad del Minijuego mediante autoridad en memoria por sala y marcador atómico en Redis

* **Estado:** Aceptado
* **Fecha:** 2026-11-10
* **Responsable:** Juan Diego Melo (P1) y Diego Rozo (P3)
* **Escenarios asociados:** ESC-04 (Disponibilidad), ESC-06 (Rendimiento)

---

## Contexto

El microservicio `planazo-game` (Java 21 + Spring Boot) ejecuta el bucle autoritativo del minijuego Snake a **20 Hz (un tick cada 50 ms)** por sala activa (RT-3). En cada tick calcula el movimiento de las serpientes, las colisiones, la recolección de comida y difunde el estado por STOMP y por el bus Redis (`GAME.STATE_UPDATE`).

Serializar y deserializar el tablero completo de cada sala en PostgreSQL o Redis 20 veces por segundo introduciría contención y latencia de red incompatibles con un tick de 50 ms. Por otro lado, cuando varias salas terminan simultáneamente, el marcador global (CC-2) no puede perder puntajes ni sufrir condiciones de carrera.

---

## Decisión

1. **Estado del tick en memoria del proceso con instancia autoritativa por sala:**
   - El bucle de 20 Hz de cada sala (`SalaActiva`) corre en memoria dentro de `planazo-game` usando un `ConcurrentHashMap` y `ScheduledExecutorService` sin bloqueos pesados.
   - Si se despliegan múltiples instancias de `game`, el balanceador enruta por afinidad de sala (`hash($salaId)`) o se mantiene una instancia autoritativa dedicada para las salas de duelo mientras el resto de servicios HTTP escalan por round-robin.
2. **Marcador global en Redis con `ZINCRBY` (CC-2):**
   - Al finalizar cada partida, los puntajes se acumulan en un *Sorted Set* de Redis mediante la operación atómica `ZINCRBY` y el histórico durable se inserta en PostgreSQL (`esquema minijuego`).
3. **Difusión desacoplada hacia el bus:**
   - Los eventos `GAME.PARTIDA_FINALIZADA` se publican en Redis (`planazo.events`) para que `promo` habilite los bonos de ganadores (`PROMO.UNLOCKED`) sin acoplamiento directo entre `game` y `promo`.

---

## Consecuencias

### Positivas
* **Tick estable a 20 Hz (< 5 ms de cómputo):** La simulación de colisiones y movimiento ocurre en RAM sin round-trips de red en medio del tick.
* **Consistencia total del marcador (CC-2):** `ZINCRBY` en Redis garantiza que aunque decenas de partidas terminen en el mismo milisegundo, ningún punto se sobrescribe ni se pierde, y la lectura del top 10 toma < 5 ms.

### Negativas y mitigaciones
* **Estado de partida en curso ligado al proceso:** Si el contenedor de `game` se reinicia en mitad de una partida de 60 segundos, esa ronda en curso se interrumpe, aunque el marcador global y el histórico previo en Redis/Postgres permanecen intactos.
  * *Mitigación:* El cliente del frontend (`lib/game/client.ts`) guarda la sala en `sessionStorage` (`minijuego.sala`), pausa la serpiente al perder foco y reconecta automáticamente por STOMP (`reconnectDelay: 2000`).
