@echo off
REM Add path to your JSON library JAR here
set JSON_JAR=json-20231013.jar

if not exist MultiClientWebSocketServer.class (
    echo Compiling MultiClientWebSocketServer.java...
    javac -cp .;Java-WebSocket-1.5.4.jar;slf4j-api-2.0.9.jar;slf4j-simple-2.0.9.jar;concentus-1.0.1.jar;%JSON_JAR% MultiClientWebSocketServer.java
) else (
    echo Already compiled, skipping...
)

echo Running server...
java -cp .;Java-WebSocket-1.5.4.jar;concentus-1.0.1.jar;slf4j-api-2.0.9.jar;slf4j-simple-2.0.9.jar;%JSON_JAR% MultiClientWebSocketServer
