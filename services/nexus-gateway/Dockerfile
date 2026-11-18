# NEXUS nexus-gateway image (reactive Spring Cloud Gateway — the HTTP door).
# Build the jar on the HOST first:
#   mvn -B -q -f services/nexus-gateway/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-gateway-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8090
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
