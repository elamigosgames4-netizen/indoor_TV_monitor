#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: ADICIONAR MONITORAMENTO DA TV — adicionar área Monitoramento ao TV Indoor Player existente, com código vazio inicialmente, URL editável salva localmente, intervalo padrão de 20 segundos editável, heartbeat POST JSON com tv_code/status/timestamp/app_version, início automático junto à TV e sem interferir no player.
## frontend:
##   - task: "Monitoramento local e heartbeat automático"
##     implemented: true
##     working: true
##     file: "/app/frontend/src/lib/monitoring.ts"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Serviço global iniciado no _layout, POST JSON implementado, timeout e status persistido; compilação web passou."
##   - task: "Área Monitoramento nas configurações"
##     implemented: true
##     working: true
##     file: "/app/frontend/app/settings.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Prévia ativa confirmou seção, código vazio, URL padrão, intervalo 20s, salvamento e persistência em um mesmo contexto."
##   - task: "Preservação do player e inicialização no boot"
##     implemented: true
##     working: true
##     file: "/app/frontend/app/_layout.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "Tela vazia do player e navegação para configurações continuam funcionando; autostart nativo existente não foi alterado."
##   - task: "Proteção contra URL de backend ausente"
##     implemented: true
##     working: true
##     file: "/app/frontend/src/lib/backend.ts"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: true
##     status_history:
##         -working: true
##         -agent: "main"
##         -comment: "A validação de EXPO_PUBLIC_BACKEND_URL foi movida para a chamada, evitando tela branca no boot quando o ZIP não contém .env."
##
## backend:
##   - task: "API existente de Google Drive"
##     implemented: true
##     working: "NA"
##     file: "/app/backend/server.py"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Não alterado pela funcionalidade; processo local está sem MONGO_URL no ambiente do ZIP e não foi possível executar health check."
##
## metadata:
##   created_by: "main_agent"
##   version: "1.1"
##   test_sequence: 1
##   run_ui: true
##
## test_plan:
##   current_focus:
##     - "Defaults and local persistence for monitoring fields"
##     - "POST heartbeat payload and error status"
##     - "Player remains functional and monitoring is screen-independent"
##     - "Existing backend regression"
##   stuck_tasks: []
##   test_all: true
##   test_priority: "high_first"
##
## agent_communication:
##     -agent: "main"
##     -message: "Initial implementation complete. Self-test passed for preview loading, Monitoramento UI, default values, save and persistence. Please test heartbeat requests, validation, regression of player/settings, and report all issues. No credentials required."

## test_iteration_2:
##   testing_agent_summary: "Frontend monitoring flow passed, including intercepted POST payload, success/error states, defaults, validation, save without playlist, and return to player. TypeScript passed."
##   fixed_after_report: "URL validation now uses URL parsing and requires http/https plus a hostname, including the Salvar e reproduzir path."
##   unresolved_environment_issue: "Existing backend supervisor cannot start because the uploaded/current workspace has no backend MONGO_URL/DB_NAME environment configuration; /api/health and /api/drive/resolve remain unavailable in this environment. No backend file was changed for the monitoring feature."
##   agent_changed_files: []