# NEXUS — java-registry image (the Eureka server; single node on purpose).
# Build the jar on the HOST first:
#   mvn -B -q -f services/java-registry/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-registry-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8761
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
