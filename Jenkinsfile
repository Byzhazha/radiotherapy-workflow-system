pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    PYTHONPATH = "${WORKSPACE}/.jenkins-python"
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'python3 -m pip install --target .jenkins-python paramiko'
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
        sh 'python3 scripts/deploy_server.py'
      }
    }
  }

  post {
    success {
      echo 'Radiotherapy Workflow API deployed to http://38.76.162.229:8750'
    }
  }
}
