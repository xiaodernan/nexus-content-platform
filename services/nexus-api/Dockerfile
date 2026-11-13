# NEXUS — nexus-api image.
# Build the jar on the HOST first:
#   mvn -B -q -f services/nexus-api/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-api-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
