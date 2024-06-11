## AWS Amplify React+Vite Starter Template

npm run dev
npx ampx sandbox --profile amplify-dev


aws ecr get-login-password --region eu-central-1 --profile amplify-dev | docker login --username AWS --password-stdin 851725442516.dkr.ecr.eu-central-1.amazonaws.com 
docker tag onerahmet/openai-whisper-asr-webservice:latest 851725442516.dkr.ecr.eu-central-1.amazonaws.com/whisper-asr-webservice:latest
docker push 851725442516.dkr.ecr.eu-central-1.amazonaws.com/whisper-asr-webservice:latest