# NEXUS — java-domain-service image (the authoritative WRITE path).
# Build the jar on the HOST first:
#   mvn -B -q -f services/java-domain-service/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/domain-service-1.0.0-SNAPSHOT.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
