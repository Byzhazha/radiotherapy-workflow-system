pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'python3 -m venv .venv'
        sh '. .venv/bin/activate && python -m pip install --upgrade pip && python -m pip install paramiko'
      }
    }

    stage('Test') {
      steps {
        sh 'npm test'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Deploy') {
      steps {
        // Deployment reuses the project script so Jenkins and manual releases
        // write the same remote service files, environment, and systemd unit.
        sh '. .venv/bin/activate && python scripts/deploy_server.py'
      }
    }
  }

  post {
    success {
      echo 'Radiotherapy Workflow API deployed to http://38.76.162.229:8750'
    }
  }
}
