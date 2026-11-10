# services/nexus-registry

The **service registry** (Spring Cloud SC-1). One standalone Eureka server. It holds the addresses of the
services that register with it and hands them to whoever asks. That is all it does.

| method | path | answer |
| --- | --- | --- |
| `POST` | `/eureka/apps/{appId}` | `204` — the instance is recorded (body is Eureka's own JSON codec over `InstanceInfo`) |
| `GET` | `/eureka/apps` | `200` + the whole registry, Eureka shape (`applications.versions__delta`, `apps__hashcode`, `application[]`) |
| `GET` | `/eureka/apps/{appId}` | `200` + the app's instances, or `404` when nobody registered that id |
| `PUT` | `/eureka/apps/{appId}/{instanceId}` | `200` — a lease renewal, or `404` for an unknown instance |
| `DELETE` | `/eureka/apps/{appId}/{instanceId}` | `200` — the instance is cancelled and the next read is `404` |

## What it is not, stated rather than implied (§60)

- **No authentication.** Anyone who can reach the port can register any service id, which is why the
  production surface for this port is the loopback interface inside the platform's own network. A registry
  with a public door is a platform where a stranger decides which machine serves the user's library.
- **No persistence.** The registry is in memory: a restart forgets every address, and clients re-register on
  their next heartbeat. Addresses that a dead service cannot renew expire on a timer.
- **No peers.** `register-with-eureka: false` and `fetch-registry: false` make it a STANDALONE registry — a
  peer that looks for neighbours it does not have logs a failure every 30 s and reports itself DOWN, which is
  a lie about a single-node deployment. Multi-node is a later slice with its own test.
- **Not a health checker.** A listed address is an address the registry HOLDS, not a machine the registry
  verified: a service that dies without cancelling its lease stays listed until the lease expires. Consumers
  that need a measured health check owe their own probe.
- **No self-registration.** The registry does not appear in its own list. If it ever did, a gateway routing
  by service id could route a domain call to the registry itself, and the test that pins this is
  `theRegistryDoesNotRegisterItself`.

## Configuration

Every value is env-overridable (`NEXUS_REGISTRY_PORT`, `NEXUS_REGISTRY_ZONE`, `NEXUS_REGISTRY_SELF_PRESERVATION`,
`NEXUS_REGISTRY_READ_ONLY_CACHE`, `NEXUS_REGISTRY_EVICTION_MS`). Two defaults differ from Eureka's library
defaults on purpose, and each is a small-fleet trade, not a setting that drifted:

- **`enable-self-preservation: false`** — self-preservation protects a real fleet from a network partition;
  with one node it instead keeps dead addresses forever.
- **`use-read-only-response-cache: false`** — the read-only cache refreshes on a 30 s timer, so a reader can
  be handed a list half a minute behind a registration that already happened. Reading the read-write cache
  removes that window at this fleet size.

## Running it

```bash
mvn -B test -f services/nexus-registry/pom.xml   # 6 wire-level tests, no network beyond loopback
mvn -B spring-boot:run -f services/nexus-registry/pom.xml
```

The tests start a REAL servlet container on a port the OS chose (`RANDOM_PORT`) and speak HTTP to it with
`java.net.http.HttpClient`. The registration bodies are produced by `EurekaJacksonCodec` — Eureka's own wire
codec — rather than a hand-written JSON literal, because a literal guesses at a format whose port and
data-center fields are not ordinary bean properties.
