# NEXUS — nexus-config-server image.
# The jar is built on the HOST (this repo's standard, warm offline Maven):
#   mvn -B -q -f services/java-config-server/pom.xml package -DskipTests
# Building here keeps CI and compose identical: JDK runs elsewhere, this image only RUNS the jar.
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-config-server-0.1.0-SNAPSHOT.jar app.jar

# The serve path is the repository's own `infra/config/`, mounted by compose at /etc/nexus-config
# (read-only): one configuration, visible to every service, managed as bytes in this repo.
ENV NEXUS_CONFIG_SEARCH=file:/etc/nexus-config/

EXPOSE 8888
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
