// every code i write beside that writes comment for what this line is doing
#include<stdio.h> // standard input output header file
#include<fcntl.h> // file control header file
#include<unistd.h> // unix standard header file
#include<string.h> // string header file

#define buffer_size 1000 // defining buffer size as 1000

int main(){
    int fd=open("server.log",O_RDONLY); // opening server.log file in read only mode
    if(fd<0){ // checking if file opened successfully
        perror("FILE OPENING FAILED"); // printing error message if file opening failed
        return 1; // returning 1 to indicate failure
    }

    char buffer[buffer_size]; // declaring buffer to store file content
    char line[1000]; // declaring line to store each line
    int total=0; // variable to store total requests
    int error404=0; // variable to store 404 errors 
    int error500=0; // variable to store 500 errors 
    int idx=0; // index for line array
    printf("Monitoring Started...\n"); // printing monitoring started message

    while(1){
        int bytes=read(fd,buffer,buffer_size-1); // reading file content into buffer
        if(bytes==0){
            sleep(1); // if no new content, sleep for 1 second
            continue; // continue to next iteration
        }

        for(int i=0;i<bytes;i++){
            if(buffer[i]=='\n'){ // if newline character is found
                line[idx]='\0'; // null terminate the line\
                idx=0; // reset index for next line
                total++; // increment total requests

                    if(strstr(line," 404 ") ) // check if line contains 404 error
                        error404++; // increment 404 error count
                    else if(strstr(line," 500 ") )
                        error500++; // increment 500 error count
                     
                    printf("\n new log: %s",line); // print the new log line

                    printf("\n Total:%d | 404:%d | 500:%d\n",total,error404,error500); // print the counts

                    idx=0; // reset index for next line
            }
            else{
                line[idx++]=buffer[i]; // add character to line
            }
        }
    }
    close(fd); // close the file descriptor
    return 0; // return 0 to indicate success
}