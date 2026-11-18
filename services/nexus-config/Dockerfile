# NEXUS nexus-config image (Spring Cloud Config, native profile — serves ITS OWN classpath).
# The served bytes are the ones committed in this repository:
#   services/nexus-config/src/main/resources/nexus-config/*.yml
# Build the jar on the HOST first:
#   mvn -B -q -f services/nexus-config/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-config-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8888
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
