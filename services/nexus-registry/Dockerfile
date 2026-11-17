# NEXUS nexus-registry image (standalone Eureka; single node on purpose).
# Build the jar on the HOST first:
#   mvn -B -q -f services/nexus-registry/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-registry-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8771
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
