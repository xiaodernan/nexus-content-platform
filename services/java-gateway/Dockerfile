# NEXUS — java-gateway image (the Spring Cloud edge).
# Build the jar on the HOST first:
#   mvn -B -q -f services/java-gateway/pom.xml package -DskipTests
FROM eclipse-temurin:25-jre

WORKDIR /app
COPY target/nexus-gateway-0.1.0-SNAPSHOT.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
